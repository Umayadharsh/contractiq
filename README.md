# ContractIQ Guard

Monorepo for a contract workspace with a React/Vite frontend, Express/Mongoose backend, and FastAPI extraction/RAG service.

## Local development

1. Copy `backend/.env.example` to `backend/.env` and set `MONGO_URI` and `JWT_SECRET`.
2. Start local MongoDB with `docker compose up -d mongodb`.
3. Install dependencies with `npm install`.
4. Start the API with `npm run dev:backend` and the frontend with `npm run dev:frontend`.
5. Start the AI health service with `python -m pip install -r ai-service/requirements.txt`, then `python -m uvicorn ai-service.main:app --reload --port 8000`.

The first registered user is the workspace Admin. Later registrations are Viewers. Admins and Reviewers can upload PDF, DOC, and DOCX files up to 10MB. Uploads are stored on local disk for development; use object storage before production because Render's filesystem is ephemeral.

## Deployment

- Import `frontend` into Vercel and set `VITE_API_URL` to the deployed Render API URL.
- Deploy the root repository with `render.yaml` or create a Render Node service with root directory `backend`.
- Set Render's `MONGO_URI` to a MongoDB Atlas connection string and `CLIENT_URL` to the Vercel URL.
- Deploy the FastAPI AI service from the `ai-service` root directory with `pip install -r requirements.txt` and `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- Set the backend's `AI_SERVICE_URL` to the deployed AI service URL.
- Set the same `AI_INTERNAL_SECRET` on the backend and AI service. The backend sends it as `X-Internal-Secret` when calling AgentGuard resume and complete.

The hosted register/login/upload flow can only be confirmed after the Vercel and Render services are created and their URLs and MongoDB Atlas credentials are supplied.

## RAG setup

The AI service stores one embedding per extracted clause in the `clause_embeddings` collection. Set these variables in the AI service environment:

```text
MONGO_URI=<the same MongoDB Atlas URI as the backend>
MONGO_DB=test
GEMINI_API_KEY=<Google AI Studio key>
GEMINI_MODEL=gemini-3.6-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
CLAUSE_VECTOR_INDEX=clause_vector_index
CLAUSE_SEARCH_INDEX=clause_search_index
```

Create an Atlas Vector Search index named `clause_vector_index` on `clause_embeddings` with this definition (`gemini-embedding-2` is configured to produce 1536 dimensions):

```json
{
	"fields": [
		{ "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine", "quantization": "scalar" },
		{ "type": "filter", "path": "contractId" }
	]
}
```

Create an Atlas Search index named `clause_search_index` on the same collection with dynamic mapping disabled and `contractId` mapped as a string field, plus `type`, `summary`, and `text` mapped as string fields. The AI service combines the top keyword and vector matches with reciprocal-rank fusion before asking the answer model to cite clause IDs.