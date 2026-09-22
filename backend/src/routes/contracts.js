import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import path from 'node:path';
import Clause from '../models/Clause.js';
import Contract from '../models/Contract.js';
import ExtractionLog from '../models/ExtractionLog.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { extractContractData } from '../services/extractionService.js';
import AgentAction from '../models/AgentAction.js';
import { executeAgentAction } from '../services/agentActionExecutor.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';

const router = Router();
const upload = multer({
  dest: path.resolve('uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(file.mimetype))
});
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const aiInternalHeaders = { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.AI_INTERNAL_SECRET || '' };

router.use(requireAuth);
router.get('/', async (req, res, next) => {
  try { res.json(await Contract.find({ workspaceId: req.query.workspaceId || req.user.id }).populate('uploadedBy', 'name email').sort({ createdAt: -1 })); } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const contract = await Contract.findOne({ _id: req.params.id, workspaceId: req.query.workspaceId || req.user.id }).populate('uploadedBy', 'name email');
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    res.json(contract);
  } catch (error) { next(error); }
});

router.post('/:id/ask', async (req, res, next) => {
  try {
    if (typeof req.body?.question !== 'string' || req.body.question.trim().length < 3) {
      return res.status(400).json({ message: 'A question with at least 3 characters is required' });
    }
    const contract = await Contract.findOne({ _id: req.params.id, workspaceId: req.query.workspaceId || req.user.id }).select('_id');
    if (!contract) return res.status(404).json({ message: 'Contract not found' });

    const response = await fetch(`${AI_SERVICE_URL}/contracts/${contract._id}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: req.body.question.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ message: body?.detail || body?.message || 'Contract question failed' });
    res.json(body);
  } catch (error) { next(error); }
});

router.post('/:id/evaluate-compliance', async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId || req.user.id;
    const contract = await Contract.findOne({ _id: req.params.id, workspaceId });
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    if (workspaceId !== req.user.id && !(await WorkspaceMembership.exists({ workspaceId, userId: req.user.id }))) {
      return res.status(403).json({ message: 'Workspace membership is required for compliance evaluation.' });
    }

    const clauses = await Clause.find({ contractId: contract._id });
    const evaluationRunId = randomUUID();

    const response = await fetch(`${AI_SERVICE_URL}/contracts/${contract._id}/evaluate-compliance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        clauses: clauses.map((c) => ({ id: String(c._id), type: c.type, text: c.text, summary: c.summary || '' })),
        evaluationRunId,
        requestedBy: { userId: String(req.user.id), role: req.user.role },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ message: body?.detail || body?.message || 'Compliance evaluation failed' });
    if (body.agentGuard?.actionStatus === 'approved') {
      const action = await AgentAction.findOne({ actionId: body.agentGuard.actionId });
      if (!action) return res.status(500).json({ message: 'AgentGuard action record was not found.' });
      await executeAgentAction(action);
      await fetch(`${AI_SERVICE_URL}/agentguard/complete`, { method: 'POST', headers: aiInternalHeaders, body: JSON.stringify({ evaluationRunId: body.evaluationRunId, actionId: body.agentGuard.actionId, status: 'completed' }) });
    }
    res.json(body);
  } catch (error) { next(error); }
});

router.post('/', allowRoles('Admin', 'Reviewer'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'A PDF, Word document, or text file is required' });

    const contract = await Contract.create({
      title: req.body.title,
      counterparty: req.body.counterparty,
      uploadedBy: req.user.id,
      fileUrl: `/uploads/${req.file.filename}`,
      workspaceId: req.body.workspaceId || req.user.id,
      status: 'Processing',
    });

    try {
      const extraction = await extractContractData(contract, req.file, req.body.rawText || req.body.text);
      contract.status = extraction.ok ? 'Reviewed' : 'NeedsReview';
      contract.extractionError = extraction.ok ? '' : extraction.reason;
      contract.rawExtractionOutput = extraction.rawOutput || null;
      contract.extractionLogs = extraction.logs || [];
      await contract.save();

      if (Array.isArray(extraction.logs) && extraction.logs.length) {
        await ExtractionLog.insertMany(extraction.logs.map((log) => ({
          contractId: contract._id,
          level: log.level || 'info',
          message: log.message || 'Extraction log',
          rawOutput: log.rawOutput || null,
          confidence: log.confidence || 'low',
          needsReview: Boolean(log.needsReview || !extraction.ok),
        })));
      }

      return res.status(201).json({
        ...contract.toObject(),
        extractedFields: contract.extractedFields || {},
        clauseCount: extraction.clauses?.length || 0,
      });
    } catch (error) {
      contract.status = 'NeedsReview';
      contract.extractionError = error.message;
      contract.rawExtractionOutput = null;
      contract.extractionLogs = [{ timestamp: new Date().toISOString(), level: 'error', message: error.message }];
      await contract.save();
      await ExtractionLog.create({
        contractId: contract._id,
        level: 'error',
        message: error.message,
        rawOutput: null,
        confidence: 'low',
        needsReview: true,
      });
      return res.status(201).json({
        ...contract.toObject(),
        extractedFields: contract.extractedFields || {},
        message: 'Contract uploaded. Extraction needs review.',
      });
    }
  } catch (error) { next(error); }
});

export default router;