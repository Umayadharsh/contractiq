import fs from 'node:fs/promises';
import path from 'node:path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

function sanitizeText(raw) {
  if (!raw) return '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

function normalizeField(field, key) {
  const normalizedField = typeof field === 'string' ? { value: field } : field;

  if (!normalizedField || normalizedField.value === undefined || normalizedField.value === null || normalizedField.value === '') {
    return {
      key,
      value: null,
      confidence: normalizedField?.confidence || 'low',
      needsReview: true,
      sourceSpan: normalizedField?.sourceSpan || null,
    };
  }

  return {
    key,
    value: normalizedField.value,
    confidence: normalizedField.confidence || 'high',
    needsReview: Boolean(normalizedField.needsReview),
    sourceSpan: normalizedField.sourceSpan || null,
  };
}

async function extractTextFromFile(file) {
  if (!file) return '';

  const absolutePath = path.resolve(file.path);
  const fileExtension = path.extname(file.originalname || '').toLowerCase();

  if (file.mimetype === 'application/pdf' || fileExtension === '.pdf') {
    const buffer = await fs.readFile(absolutePath);
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileExtension === '.docx') {
    const buffer = await fs.readFile(absolutePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (file.mimetype === 'application/msword' || fileExtension === '.doc') {
    const buffer = await fs.readFile(absolutePath);
    return buffer.toString('utf8');
  }

  if (file.mimetype === 'text/plain' || fileExtension === '.txt') {
    return (await fs.readFile(absolutePath, 'utf8')) || '';
  }

  return '';
}

// Normalize failures from the /extract fetch so callers can distinguish:
//  - timeout (AbortError from our AbortController)
//  - network failure (fetch rejection; retains undici cause code e.g. UND_ERR_HEADERS_TIMEOUT)
// HTTP errors are not thrown here; they are handled by the response.ok branch downstream.
function normalizeExtractionError(error, timeoutMs) {
  if (error?.name === 'AbortError') {
    const timedOut = new Error(`AI contract extraction timed out after ${timeoutMs / 1000}s.`);
    timedOut.code = 'EXTRACTION_TIMEOUT';
    timedOut.cause = error;
    return timedOut;
  }
  const cause = error?.cause;
  const networkError = new Error(`AI contract extraction request failed: ${error?.message || 'network error'}`);
  networkError.code = cause?.code || cause?.name || error?.name || 'EXTRACTION_NETWORK_ERROR';
  networkError.cause = cause || error;
  return networkError;
}

export async function extractContractData(contract, file, rawText) {
  const text = sanitizeText(rawText || (await extractTextFromFile(file)));
  if (!text) {
    return { ok: false, reason: 'No contract text could be extracted from the uploaded file.', logs: [{ timestamp: new Date().toISOString(), level: 'warning', message: 'No contract text extracted from upload.' }], clauses: [] };
  }

  const controller = new AbortController();
  const timeoutMs = 120_000; // Abort if the AI service does not respond within 120s.
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${AI_SERVICE_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch (error) {
    throw normalizeExtractionError(error, timeoutMs);
  } finally {
    clearTimeout(timeoutId);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body?.detail?.message || body?.message || 'AI contract extraction failed validation.';
    const logs = [{ timestamp: new Date().toISOString(), level: 'error', message: reason, rawOutput: body?.detail?.rawOutput || null }];
    return { ok: false, reason, clauses: [], logs, rawOutput: body?.detail?.rawOutput || null };
  }

  const extractedFields = {
    parties: Array.isArray(body.parties) ? body.parties.map((party) => normalizeField(party, 'parties')) : [],
    contractValue: normalizeField(body.contractValue, 'contractValue'),
    startDate: normalizeField(body.startDate, 'startDate'),
    endDate: normalizeField(body.endDate, 'endDate'),
    governingLaw: normalizeField(body.governingLaw, 'governingLaw'),
    paymentTerms: normalizeField(body.paymentTerms, 'paymentTerms'),
    liabilityLimit: normalizeField(body.liabilityLimit, 'liabilityLimit'),
    clauses: Array.isArray(body.clauses) ? body.clauses.map((clause) => ({
      type: clause.type,
      text: clause.text,
      summary: clause.summary || '',
      confidence: clause.confidence || 'low',
      needsReview: Boolean(clause.needsReview),
      sourceSpan: clause.sourceSpan || null,
    })) : [],
  };

  const highConfidence = Object.entries(extractedFields).every(([key, value]) => {
    if (key === 'parties') return Array.isArray(value) ? value.length > 0 && value.every((item) => item.confidence === 'high' && !item.needsReview) : false;
    if (key === 'clauses') return Array.isArray(value) ? value.every((item) => item.confidence === 'high' && !item.needsReview) : true;
    return value && value.confidence === 'high' && !value.needsReview;
  });

  contract.extractedFields = extractedFields;

  const Clause = (await import('../models/Clause.js')).default;
  await Clause.deleteMany({ contractId: contract._id });

  const clauses = extractedFields.clauses.map((clause) => ({
    contractId: contract._id,
    type: clause.type,
    text: clause.text,
    summary: clause.summary || '',
    confidence: clause.confidence,
    needsReview: clause.needsReview,
    sourceSpan: clause.sourceSpan || null,
  }));

  let storedClauses = [];
  if (clauses.length) {
    storedClauses = await Clause.insertMany(clauses);
  }

  const logs = [{
    timestamp: new Date().toISOString(),
    level: highConfidence ? 'info' : 'warning',
    message: highConfidence ? 'Extraction succeeded with high-confidence values.' : 'Extraction completed with low-confidence or review-required values.',
    rawOutput: body,
  }];

  try {
    const indexingResponse = await fetch(`${AI_SERVICE_URL}/index-contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractId: String(contract._id),
        clauses: storedClauses.map((clause) => ({
          id: String(clause._id),
          type: clause.type,
          text: clause.text,
          summary: clause.summary || '',
        })),
      }),
    });
    if (!indexingResponse.ok) {
      const indexingBody = await indexingResponse.json().catch(() => ({}));
      logs.push({ timestamp: new Date().toISOString(), level: 'warning', message: indexingBody?.detail || 'Clause indexing failed; contract extraction is still available.' });
    }
  } catch (error) {
    logs.push({ timestamp: new Date().toISOString(), level: 'warning', message: `Clause indexing unavailable: ${error.message}` });
  }

  return {
    ok: !highConfidence ? false : true,
    reason: highConfidence ? '' : 'One or more extracted fields are below high confidence and require review.',
    clauses,
    logs,
    rawOutput: body,
    extractedFields,
  };
}
