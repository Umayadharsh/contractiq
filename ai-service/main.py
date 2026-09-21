import json
import os
import re
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from openai import OpenAI
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

load_dotenv()

app = FastAPI(title="ContractIQ AI Service")
INVALID_PLACEHOLDERS = {
    "n/a",
    "na",
    "none",
    "not applicable",
    "unknown",
    "tbd",
    "to be determined",
    "unavailable",
    "not specified",
    "pending",
    "undetermined",
    "generic",
}


class SourceSpan(BaseModel):
    start: int
    end: int
    text: str


class FieldMetadata(BaseModel):
    value: str | None = None
    confidence: str = "high"
    sourceSpan: SourceSpan | None = None
    needsReview: bool = False

    model_config = ConfigDict(extra="forbid")

    @field_validator("confidence")
    @classmethod
    def ensure_confidence(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"high", "medium", "low"}:
            raise ValueError("confidence must be one of: high, medium, low")
        return normalized

    @field_validator("value")
    @classmethod
    def normalize_value(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    @model_validator(mode="after")
    def sync_needs_review(self):
        if self.value is None or self.value.strip() == "":
            self.needsReview = True
            if self.confidence == "high":
                self.confidence = "low"
            return self
        if self.confidence != "high":
            self.needsReview = True
        return self


class ClauseExtraction(BaseModel):
    type: str
    text: str
    summary: str | None = None
    confidence: str = "high"
    sourceSpan: SourceSpan | None = None
    needsReview: bool = False

    model_config = ConfigDict(extra="forbid")

    @field_validator("type")
    @classmethod
    def ensure_tag_is_meaningful(cls, value: str) -> str:
        tag = value.strip().lower()
        if not tag:
            raise ValueError("Clause type is required")
        return tag

    @field_validator("text")
    @classmethod
    def ensure_text_is_meaningful(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Clause text is required")
        return value.strip()

    @field_validator("confidence")
    @classmethod
    def ensure_confidence(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"high", "medium", "low"}:
            raise ValueError("confidence must be one of: high, medium, low")
        return normalized

    @model_validator(mode="after")
    def sync_needs_review(self):
        if self.confidence != "high":
            self.needsReview = True
        return self


class ContractExtraction(BaseModel):
    parties: list[FieldMetadata] = Field(..., min_length=1)
    contractValue: FieldMetadata | None = None
    startDate: FieldMetadata | None = None
    endDate: FieldMetadata | None = None
    governingLaw: FieldMetadata | None = None
    paymentTerms: FieldMetadata | None = None
    liabilityLimit: FieldMetadata | None = None
    clauses: list[ClauseExtraction] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def normalize_structured_values(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        parties = normalized.get("parties")
        if isinstance(parties, list):
            normalized["parties"] = [
                {"value": party} if isinstance(party, str) else party
                for party in parties
            ]

        for field_name in ["contractValue", "startDate", "endDate", "governingLaw", "paymentTerms", "liabilityLimit"]:
            field_value = normalized.get(field_name)
            if isinstance(field_value, str):
                normalized[field_name] = {"value": field_value}

        return normalized

    @field_validator("parties")
    @classmethod
    def validate_parties(cls, value: list[FieldMetadata]) -> list[FieldMetadata]:
        cleaned = [party for party in value if party.value and party.value.strip()]
        if not cleaned:
            raise ValueError("At least one party is required")
        return cleaned


class ExtractionRequest(BaseModel):
    text: str = Field(..., min_length=10)


class ClauseChunk(BaseModel):
    id: str
    type: str
    text: str = Field(..., min_length=1)
    summary: str = ""


class IndexContractRequest(BaseModel):
    contractId: str = Field(..., min_length=1)
    clauses: list[ClauseChunk] = Field(default_factory=list)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3)


def _mongo_collection():
    uri = os.getenv("MONGO_URI")
    if not uri:
        raise HTTPException(status_code=503, detail="MONGO_URI is not configured for RAG.")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    database = client[os.getenv("MONGO_DB", "contractiq")]
    return client, database[os.getenv("RAG_COLLECTION", "clause_embeddings")]


def _embedding_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured for RAG.")
    return OpenAI(api_key=api_key)


def _create_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    response = _embedding_client().embeddings.create(
        model=os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        input=texts,
    )
    return [item.embedding for item in sorted(response.data, key=lambda item: item.index)]


def _chunk_text(clause: ClauseChunk) -> str:
    return f"Clause type: {clause.type}\nSummary: {clause.summary}\nClause text: {clause.text}".strip()


def _expand_clause(clause: ClauseChunk) -> list[ClauseChunk]:
    if len(clause.text) <= 6000:
        return [clause]
    sentences = re.split(r"(?<=[.!?])\s+", clause.text)
    chunks: list[ClauseChunk] = []
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > 6000:
            chunk_number = len(chunks) + 1
            chunks.append(clause.model_copy(update={"id": f"{clause.id}-{chunk_number}", "text": current.strip()}))
            current = current[-300:] + " " + sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        chunks.append(clause.model_copy(update={"id": f"{clause.id}-{len(chunks) + 1}", "text": current.strip()}))
    return chunks


def _reciprocal_rank_fusion(vector_results: list[dict[str, Any]], keyword_results: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    combined: dict[str, dict[str, Any]] = {}
    for result_set in (vector_results, keyword_results):
        for rank, result in enumerate(result_set, start=1):
            clause_id = result["clauseId"]
            entry = combined.setdefault(clause_id, {**result, "rrfScore": 0.0})
            entry["rrfScore"] += 1 / (60 + rank)
            entry["score"] = max(entry.get("score", 0.0), result.get("score", 0.0))
    return sorted(combined.values(), key=lambda result: result["rrfScore"], reverse=True)[:limit]


def _search_clauses(contract_id: str, question: str) -> list[dict[str, Any]]:
    client, collection = _mongo_collection()
    try:
        query_vector = _create_embeddings([question])[0]
        vector_results = list(collection.aggregate([
            {"$vectorSearch": {
                "index": os.getenv("CLAUSE_VECTOR_INDEX", "clause_vector_index"),
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 100,
                "limit": 20,
                "filter": {"contractId": contract_id},
            }},
            {"$project": {"_id": 0, "clauseId": 1, "type": 1, "text": 1, "summary": 1, "score": {"$meta": "vectorSearchScore"}}},
        ]))
        keyword_results = list(collection.aggregate([
            {"$search": {
                "index": os.getenv("CLAUSE_SEARCH_INDEX", "clause_search_index"),
                "compound": {"must": [{"text": {"query": question, "path": ["text", "summary", "type"]}}], "filter": [{"equals": {"path": "contractId", "value": contract_id}}]},
            }},
            {"$limit": 20},
            {"$project": {"_id": 0, "clauseId": 1, "type": 1, "text": 1, "summary": 1, "score": {"$meta": "searchScore"}}},
        ]))
        return _reciprocal_rank_fusion(vector_results, keyword_results)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"RAG database search failed: {exc}") from exc
    finally:
        client.close()


def _answer_question(question: str, results: list[dict[str, Any]]) -> str:
    context = "\n\n".join(
        f"[Clause {result['clauseId']} | {result['type']}]\n{result['text']}"
        for result in results
    )
    response = _embedding_client().chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": "Answer contract questions only from the supplied clauses. Cite every material statement with [Clause <id>] using the exact clause ID. If the clauses do not establish an answer, say so clearly. Do not invent terms."},
            {"role": "user", "content": f"Question: {question}\n\nRetrieved clauses:\n{context}"},
        ],
    )
    return response.choices[0].message.content or "The retrieved clauses did not provide an answer."


def _looks_placeholder(value: Any) -> bool:
    if value is None:
        return False
    normalized = str(value).strip().lower().replace("_", " ")
    return not normalized or normalized in INVALID_PLACEHOLDERS or normalized.startswith("unknown")


def _has_low_confidence(extraction: ContractExtraction) -> bool:
    for party in extraction.parties:
        if party.value is None or _looks_placeholder(party.value) or party.confidence != "high":
            return True
    for field_name in ["contractValue", "startDate", "endDate", "governingLaw", "paymentTerms", "liabilityLimit"]:
        field_value = getattr(extraction, field_name)
        if field_value is not None and (field_value.value is None or _looks_placeholder(field_value.value) or field_value.confidence != "high"):
            return True
    if not extraction.clauses:
        return True
    for clause in extraction.clauses:
        if clause.confidence != "high" or _looks_placeholder(clause.type) or _looks_placeholder(clause.text):
            return True
    return False


def _serialize_extraction(extraction: ContractExtraction) -> dict[str, Any]:
    serialized = extraction.model_dump()
    serialized["parties"] = [party.value for party in extraction.parties]
    for field_name in ["contractValue", "startDate", "endDate", "governingLaw", "paymentTerms", "liabilityLimit"]:
        field_value = getattr(extraction, field_name)
        serialized[field_name] = field_value.value if field_value is not None else None
    return serialized


def _build_json_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "parties": {"type": "array", "items": {"$ref": "#/$defs/fieldMetadata"}},
            "contractValue": {"anyOf": [{"$ref": "#/$defs/fieldMetadata"}, {"type": "null"}]},
            "startDate": {"anyOf": [{"$ref": "#/$defs/fieldMetadata"}, {"type": "null"}]},
            "endDate": {"anyOf": [{"$ref": "#/$defs/fieldMetadata"}, {"type": "null"}]},
            "governingLaw": {"anyOf": [{"$ref": "#/$defs/fieldMetadata"}, {"type": "null"}]},
            "paymentTerms": {"anyOf": [{"$ref": "#/$defs/fieldMetadata"}, {"type": "null"}]},
            "liabilityLimit": {"anyOf": [{"$ref": "#/$defs/fieldMetadata"}, {"type": "null"}]},
            "clauses": {
                "type": "array",
                "items": {"$ref": "#/$defs/clauseMetadata"},
            },
        },
        "required": ["parties", "contractValue", "startDate", "endDate", "governingLaw", "paymentTerms", "liabilityLimit", "clauses"],
        "$defs": {
            "sourceSpan": {
                "type": "object",
                "properties": {
                    "start": {"type": "integer"},
                    "end": {"type": "integer"},
                    "text": {"type": "string"},
                },
                "required": ["start", "end", "text"],
                "additionalProperties": False,
            },
            "fieldMetadata": {
                "type": "object",
                "properties": {
                    "value": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "sourceSpan": {"anyOf": [{"$ref": "#/$defs/sourceSpan"}, {"type": "null"}]},
                    "needsReview": {"type": "boolean"},
                },
                "required": ["value", "confidence", "sourceSpan", "needsReview"],
                "additionalProperties": False,
            },
            "clauseMetadata": {
                "type": "object",
                "properties": {
                    "type": {"type": "string"},
                    "text": {"type": "string"},
                    "summary": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "sourceSpan": {"anyOf": [{"$ref": "#/$defs/sourceSpan"}, {"type": "null"}]},
                    "needsReview": {"type": "boolean"},
                },
                "required": ["type", "text", "confidence", "sourceSpan", "needsReview"],
                "additionalProperties": False,
            },
        },
        "additionalProperties": False,
    }


def _extract_with_llm(raw_text: str, validation_error: str | None = None) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail={"message": "OPENAI_API_KEY is not configured for contract extraction."})

    client = OpenAI(api_key=api_key)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a contract extraction engine. Return only valid JSON matching the schema exactly. "
                "Do not guess. If a value is not explicitly present in the text, set value to null and confidence to low. "
                "Every extracted value must include confidence, needsReview, and sourceSpan {start, end, text}. "
                "sourceSpan.text must be the exact text snippet from the source document. "
                "Use the tag names: termination, liability, renewal, indemnity, payment, confidentiality, governing_law, other."
            ),
        },
        {
            "role": "user",
            "content": (
                "Extract the following fields from the contract: parties, contractValue, startDate, endDate, governingLaw, paymentTerms, liabilityLimit, clauses. "
                "Each field must be returned as {value, confidence, sourceSpan, needsReview}. "
                "confidence must be high, medium, or low. "
                "For clauses, include type, text, summary, confidence, sourceSpan, needsReview. "
                "If missing, set value to null and confidence to low. "
                "The JSON must be strictly valid and match the schema. "
                + (f"The previous attempt failed validation. Fix this exactly: {validation_error}. " if validation_error else "")
                + "Do not include commentary.\n\nContract text:\n"
                + raw_text[:20000]
            ),
        },
    ]

    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=messages,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "contract_extraction",
                "schema": _build_json_schema(),
                "strict": True,
            },
        },
    )

    content = response.choices[0].message.content
    if not content:
        raise ValueError("The LLM returned an empty response.")

    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError("The LLM response was not valid JSON.") from exc


@app.get("/health")
def health_check():
    try:
        client, _ = _mongo_collection()
        client.admin.command('ping')
        client.close()
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {exc}")


@app.post("/index-contract")
def index_contract(payload: IndexContractRequest):
    chunks = [chunk for clause in payload.clauses for chunk in _expand_clause(clause)]
    client, collection = _mongo_collection()
    try:
        if not chunks:
            collection.delete_many({"contractId": payload.contractId})
            return {"indexed": 0}
        embeddings = _create_embeddings([_chunk_text(chunk) for chunk in chunks])
        collection.delete_many({"contractId": payload.contractId})
        collection.insert_many([
            {
                "contractId": payload.contractId,
                "clauseId": chunk.id,
                "type": chunk.type,
                "text": chunk.text,
                "summary": chunk.summary,
                "embedding": embedding,
            }
            for chunk, embedding in zip(chunks, embeddings)
        ])
        return {"indexed": len(chunks)}
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"RAG indexing failed: {exc}") from exc
    finally:
        client.close()


@app.post("/contracts/{contract_id}/ask")
def ask_contract(payload: AskRequest, contract_id: str):
    results = _search_clauses(contract_id, payload.question)
    if not results:
        raise HTTPException(status_code=404, detail="No indexed clauses were found for this contract.")
    answer = _answer_question(payload.question, results)
    return {
        "answer": answer,
        "citations": [
            {"clauseId": result["clauseId"], "type": result["type"], "text": result["text"]}
            for result in results
        ],
    }


@app.post("/extract")
def extract_contract(payload: ExtractionRequest):
    last_error: str | None = None
    raw_output: Any = None

    for attempt in range(2):
        try:
            raw_output = _extract_with_llm(payload.text)
            validated = ContractExtraction.model_validate(raw_output)
            if _has_low_confidence(validated):
                last_error = "low-confidence or missing contract fields"
                continue
            return _serialize_extraction(validated)
        except ValidationError as exc:
            last_error = exc.errors()
            continue
        except ValueError as exc:
            last_error = str(exc)
            continue

    raise HTTPException(
        status_code=422,
        detail={
            "message": "LLM extraction returned low-confidence or invalid fields after a retry and was marked needs_review.",
            "needsReview": True,
            "rawOutput": raw_output,
            "errors": last_error,
        },
    )
