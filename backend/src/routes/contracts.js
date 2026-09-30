import { Router } from 'express';
import { logAudit } from '../utils/auditLogger.js';
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
import { resolveWorkspace, getNotificationRecipients } from '../utils/workspace.js';
import { visibleContractFilter } from '../utils/contractVisibility.js';
import { triggerN8nWebhook } from '../utils/n8n.js';

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
  try {
    const workspaceId = await resolveWorkspace(req);
    // The list is filtered here, on the server: an Admin sees every contract, a
    // Reviewer only what is awaiting approval, a Viewer only what is approved.
    const visible = await visibleContractFilter(req.user, workspaceId);
    res.json(await Contract.find({ workspaceId, ...visible }).populate('uploadedBy', 'name email').sort({ createdAt: -1 }));
  } catch (error) { next(error); }
});

router.get('/expiring', async (req, res, next) => {
    try {
      const workspaceId = await resolveWorkspace(req);
      const contracts = await Contract.find({ workspaceId }).populate('uploadedBy', 'email name');
      
      const now = new Date();
      const recipients = await getNotificationRecipients(workspaceId);
      const result = [];
      for (const c of contracts) {
        const endDateRaw = c.extractedFields?.endDate || c.extractedFields?.['End Date'] || c.extractedFields?.expirationDate;
        if (!endDateRaw) continue;
        
        // Handle both string and object { value: "..." } formats
        const endDateStr = typeof endDateRaw === 'object' ? (endDateRaw.value || endDateRaw.text) : endDateRaw;
        if (typeof endDateStr !== 'string') continue;

        const match = endDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!match) continue;

        // Parse target as midnight UTC to avoid timezone shift
        const targetUtc = Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        
        // Get today as midnight UTC based on the server's local calendar date
        const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Exact calendar days difference
        const diffDays = Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));

        if ([30, 14, 7].includes(diffDays)) {
          result.push({
            contractId: c._id,
            title: c.title,
            counterparty: c.counterparty,
            uploaderEmail: c.uploadedBy?.email,
            endDate: endDateStr.split('T')[0],
            daysRemaining: diffDays,
            recipients
          });
        }
      }
      
      res.json(result);
    } catch (error) { next(error); }
});

router.get('/stats', async (req, res, next) => {
    try {
      const workspaceId = await resolveWorkspace(req);
      const contracts = await Contract.find({ workspaceId });
      
      let approved = 0;
      let rejected = 0;
      let waitingForEvaluation = 0;
      let waitingForApproval = 0;
      let criticalMajorRisks = 0;
      let approachingRenewal = 0;
      const now = new Date();

      for (const c of contracts) {
        if (c.status === 'Approved') approved++;
        if (c.status === 'Rejected') rejected++;
        if (c.status === 'Waiting for Evaluation' || c.status === 'NeedsReview') waitingForEvaluation++;
        if (c.status === 'Waiting for Approval') waitingForApproval++;
        
        if (c.complianceReport?.overallStatus?.toLowerCase() === 'critical' || c.complianceReport?.overallStatus?.toLowerCase() === 'major') {
          criticalMajorRisks++;
        }

        const endDateRaw = c.extractedFields?.endDate || c.extractedFields?.['End Date'] || c.extractedFields?.expirationDate;
        if (endDateRaw) {
          const endDateStr = typeof endDateRaw === 'object' ? (endDateRaw.value || endDateRaw.text) : endDateRaw;
          if (typeof endDateStr === 'string') {
            const match = endDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (match) {
              const targetUtc = Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
              const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
              const diffDays = Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
              if (diffDays <= 30 && diffDays > 0) approachingRenewal++;
            }
          }
        }
      }
      
      const stats = {
        total: contracts.length, 
        approved, 
        rejected, 
        waitingForEvaluation, 
        waitingForApproval, 
        criticalMajorRisks, 
        approachingRenewal 
      };

      let summary = '';
      try {
        const aiResponse = await fetch(`${AI_SERVICE_URL}/summarize-stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.AI_INTERNAL_SECRET || '' },
          body: JSON.stringify({ stats })
        });
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          summary = aiData.summary;
        }
      } catch (err) {
        console.error('Failed to fetch AI summary:', err);
      }

      const recipients = await getNotificationRecipients(workspaceId);
      res.json({ ...stats, summary, recipients });
    } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const workspaceId = await resolveWorkspace(req);
    const visible = await visibleContractFilter(req.user, workspaceId);
    // Filtering a single read by the same rule stops a Viewer or Reviewer from
    // reaching a contract they cannot see by guessing its id.
    // The two conditions are combined with $and rather than spread, because the
    // visibility filter constrains _id as well: spreading it after `_id` would
    // replace the id being looked up with the visible-id set, and the route would
    // return whichever visible contract came first.
    const contract = await Contract.findOne({ workspaceId, $and: [{ _id: req.params.id }, visible] }).populate('uploadedBy', 'name email');
    if (!contract) return res.status(404).json({ message: 'Contract not found' });
    res.json(contract);
  } catch (error) { next(error); }
});

router.post('/:id/ask', async (req, res, next) => {
  try {
    if (typeof req.body?.question !== 'string' || req.body.question.trim().length < 3) {
      return res.status(400).json({ message: 'A question with at least 3 characters is required' });
    }
    const workspaceId = await resolveWorkspace(req);
    const visible = await visibleContractFilter(req.user, workspaceId);
    // $and for the same reason as GET /:id -- the visibility filter constrains
    // _id, so it must not overwrite the id being asked about.
    const contract = await Contract.findOne({ workspaceId, $and: [{ _id: req.params.id }, visible] }).select('_id');
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

// Evaluation is what raises the pending approval a Reviewer works from, so it is
// scoped to the workspace and to the roles that may act on a contract -- but it
// is deliberately NOT filtered by list visibility. A contract has no action at
// all until it is first evaluated, so applying the "Reviewer sees only pending"
// rule here would make the first evaluation impossible: nothing could ever
// reach a pending state.
router.post('/:id/evaluate-compliance', allowRoles('Admin', 'Reviewer'), async (req, res, next) => {
  try {
    const workspaceId = await resolveWorkspace(req);
    const contract = await Contract.findOne({ _id: req.params.id, workspaceId }).populate('uploadedBy', 'email name');
    if (!contract) return res.status(404).json({ message: 'Contract not found' });

    const clauses = await Clause.find({ contractId: contract._id });
    if (!clauses || clauses.length === 0) {
      return res.status(400).json({ message: 'Evaluation failed: Contract extraction failed to find any clauses. Please ensure the contract was extracted properly and retry.' });
    }
    const evaluationRunId = randomUUID();
    console.log('Evaluation started');

    const uploaderId = contract.uploadedBy?._id
      ? String(contract.uploadedBy._id)
      : (contract.uploadedBy ? String(contract.uploadedBy) : null);

    const response = await fetch(`${AI_SERVICE_URL}/contracts/${contract._id}/evaluate-compliance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        clauses: clauses.map((c) => ({ id: String(c._id), type: c.type, text: c.text, summary: c.summary || '' })),
        evaluationRunId,
        requestedBy: { userId: String(req.user.id), role: req.user.role },
        uploadedBy: uploaderId,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        contract.status = 'Failed';
        await contract.save();
        return res.status(response.status).json({ message: body?.detail || body?.message || 'Compliance evaluation failed' });
    }

    const correctProposer = uploaderId;
    if (body.agentGuard?.actionId) {
      await AgentAction.updateOne(
        { actionId: body.agentGuard.actionId },
        { $set: { 'proposal.proposedBy': correctProposer, createdBy: correctProposer } }
      );
    }
    if (Array.isArray(body.proposedActions)) {
      body.proposedActions.forEach((pa) => {
        if (pa.proposal) pa.proposal.proposedBy = correctProposer;
      });
    }
    if (body.agentAction?.proposal) {
      body.agentAction.proposal.proposedBy = correctProposer;
    }

    contract.complianceReport = {
      overallRiskScore: body.overallRiskScore,
      overallStatus: body.overallStatus,
      assessments: body.assessments,
      retrievedRulesCount: body.retrievedRulesCount,
      rejectedCount: body.rejectedCount,
      proposedActions: body.proposedActions,
      evaluationRunId: body.evaluationRunId,
      agentGuard: body.agentGuard
    };
    if (!body.agentGuard || Object.keys(body.agentGuard).length === 0) {
      contract.status = 'Failed'; // No clauses extracted or evaluation yielded no AgentGuard result
    } else if (body.agentGuard?.actionStatus === 'pending_approval') {
      contract.status = 'Waiting for Approval';
    } else if (body.agentGuard?.actionStatus === 'blocked') {
      contract.status = 'Rejected';
    } else {
      contract.status = 'Reviewed';
    }
    await contract.save();
    console.log('Evaluation completed');
    console.log(`Risk score: ${body.overallRiskScore}`);
    console.log(`Status: ${body.overallStatus}`);
    if (body.agentGuard) console.log('AgentGuard action created');

    console.log('n8n webhook triggered');
    triggerN8nWebhook('new-upload', {
      recipients: await getNotificationRecipients(workspaceId, req.user.id),
      contractId: contract._id.toString(),
      workspaceId: workspaceId.toString(),
      uploaderEmail: contract.uploadedBy?.email || req.user.email,
      contractTitle: contract.title,
      title: contract.title,
      authorization: req.headers.authorization,
      evaluationResult: {
        overallRiskScore: body.overallRiskScore,
        overallStatus: body.overallStatus
      }
    });

    const criticalAssessment = body.assessments?.find(a => String(a.severity).toLowerCase() === 'critical' || String(a.riskLevel).toLowerCase() === 'critical' || String(a.status).toLowerCase() === 'critical');
    const hasCriticalRisk = !!criticalAssessment || String(body.overallStatus).toLowerCase() === 'critical';
    if (hasCriticalRisk) {
      triggerN8nWebhook('risk-escalation', {
        contractId: contract._id.toString(),
        contractTitle: contract.title,
        counterparty: contract.counterparty,
        riskSeverity: 'Critical',
        riskReason: criticalAssessment?.analysis || 'Overall critical status',
        citedRule: criticalAssessment?.ruleId || 'N/A',
        citedClause: criticalAssessment?.clauseText || 'N/A',
        recipients: await getNotificationRecipients(workspaceId, req.user.id)
      });
    }

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
      workspaceId: await resolveWorkspace(req),
      status: 'Processing',
    });

    try {
      const extraction = await extractContractData(contract, req.file, req.body.rawText || req.body.text);
      const isCompleteFailure = !extraction.ok && extraction.clauses.length === 0 && (!extraction.extractedFields || Object.keys(extraction.extractedFields).length === 0);
      contract.status = isCompleteFailure ? 'NeedsReview' : 'Waiting for Evaluation';
      contract.extractionError = extraction.ok ? '' : extraction.reason;
      contract.rawExtractionOutput = extraction.rawOutput || null;
      contract.extractionLogs = extraction.logs || [];
      await contract.save();
      console.log('Contract uploaded');
      console.log('Contract saved');
      console.log(`Status: ${contract.status}`);

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
      await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId: contract.workspaceId, actionType: 'upload_contract', decision: 'success', details: { contractId: contract._id, title: contract.title } });
        return res.status(201).json({
        ...contract.toObject(),
        extractedFields: contract.extractedFields || {},
        clauseCount: extraction.clauses?.length || 0,
      });
    } catch (error) {
      const cause = error?.cause;
      const errorCode = error?.code || cause?.code || cause?.name || error?.name || 'UNKNOWN';
      const causeSuffix = cause?.code || cause?.name ? ` (${cause.code || cause.name})` : '';
      const diagnostic = error?.message
        ? `${error.message}${causeSuffix}`
        : `Extraction failed [${errorCode}]`;
      contract.status = 'NeedsReview';
      contract.extractionError = diagnostic;
      contract.rawExtractionOutput = null;
      contract.extractionLogs = [{ timestamp: new Date().toISOString(), level: 'error', message: diagnostic, errorCode }];
      await contract.save();
      await ExtractionLog.create({
        contractId: contract._id,
        level: 'error',
        message: diagnostic,
        rawOutput: null,
        confidence: 'low',
        needsReview: true,
      });
      await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId: contract.workspaceId, actionType: 'upload_contract', decision: 'success', details: { contractId: contract._id, title: contract.title } });
        return res.status(201).json({
        ...contract.toObject(),
        extractedFields: contract.extractedFields || {},
        message: 'Contract uploaded. Extraction needs review.',
      });
    }
  } catch (error) { next(error); }
});

export default router;