import { Router } from 'express';
import AgentPolicy from '../models/AgentPolicy.js';
import AgentAction from '../models/AgentAction.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { executeAgentAction } from '../services/agentActionExecutor.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const aiInternalHeaders = { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.AI_INTERNAL_SECRET || '' };

function workspaceFor(req) {
  if (!req.user || typeof req.user !== 'object' || !req.user.id) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }
  const workspaceId = req.query?.workspaceId || req.body?.workspaceId || req.user.id;
  if (!workspaceId) {
    const error = new Error('A valid workspace is required for this request');
    error.statusCode = 400;
    throw error;
  }
  return workspaceId;
}

async function requireWorkspace(req, workspaceId) {
  const isOwner = workspaceId === req.user.id;
  const membership = isOwner || await WorkspaceMembership.exists({ workspaceId, userId: req.user.id });
  if (!membership) {
    const error = new Error('Workspace membership is not configured for this workspace.');
    error.statusCode = 403;
    throw error;
  }
}

router.use(requireAuth);

router.get('/policies', allowRoles('Admin'), async (req, res, next) => {
  try {
    const workspaceId = workspaceFor(req);
    await requireWorkspace(req, workspaceId);
    res.json(await AgentPolicy.find({ workspaceId }).sort({ priority: -1, policyId: 1, version: -1 }));
  } catch (error) {
    console.error('[AgentGuard] GET /policies failed:', { name: error.name, message: error.message, stack: error.stack });
    next(error);
  }
});

router.get('/policies/:id', allowRoles('Admin'), async (req, res, next) => {
  try {
    const policy = await AgentPolicy.findOne({ _id: req.params.id, workspaceId: workspaceFor(req) });
    if (!policy) return res.status(404).json({ message: 'AgentGuard policy not found' });
    await requireWorkspace(req, policy.workspaceId);
    res.json(policy);
  } catch (error) { next(error); }
});

router.post('/policies', allowRoles('Admin'), async (req, res, next) => {
  try {
    const workspaceId = workspaceFor(req);
    await requireWorkspace(req, workspaceId);
    const { policyId, name, description, priority, trigger, decision, action, approval, version } = req.body;
    if (!policyId || !name || !description || !action?.type || !decision || !trigger) {
      return res.status(400).json({ message: 'policyId, name, description, trigger, decision, and action.type are required.' });
    }
    if (!Object.keys(trigger).some((key) => key === 'event' ? Boolean(trigger[key]) : Array.isArray(trigger[key]) && trigger[key].length)) {
      return res.status(400).json({ message: 'At least one policy trigger is required.' });
    }
    const normalizedPolicyId = String(policyId).trim().toUpperCase();
    const policyVersion = version || 1;
    const existing = await AgentPolicy.findOne({ workspaceId, policyId: normalizedPolicyId, version: policyVersion });
    if (existing) {
      return res.status(409).json({ message: `A AgentGuard policy with policyId '${normalizedPolicyId}' and version ${policyVersion} already exists in this workspace. To change it, edit or delete the existing policy.` });
    }
    const policy = await AgentPolicy.create({
      policyId: normalizedPolicyId, workspaceId, name, description, priority: priority ?? 0, trigger, decision, action,
      approval: approval || {}, version: policyVersion, createdBy: req.user.id, updatedBy: req.user.id,
    });
    res.status(201).json(policy);
  } catch (error) { next(error); }
});

router.put('/policies/:id', allowRoles('Admin'), async (req, res, next) => {
  try {
    const policy = await AgentPolicy.findOne({ _id: req.params.id, workspaceId: workspaceFor(req) });
    if (!policy) return res.status(404).json({ message: 'AgentGuard policy not found' });
    await requireWorkspace(req, policy.workspaceId);
    const fields = ['name', 'description', 'priority', 'trigger', 'decision', 'action', 'approval', 'isActive'];
    for (const field of fields) if (req.body[field] !== undefined) policy[field] = req.body[field];
    policy.version += 1;
    policy.updatedBy = req.user.id;
    await policy.save();
    res.json(policy);
  } catch (error) { next(error); }
});

router.delete('/policies/:id', allowRoles('Admin'), async (req, res, next) => {
  try {
    const policy = await AgentPolicy.findOne({ _id: req.params.id, workspaceId: workspaceFor(req) });
    if (!policy) return res.status(404).json({ message: 'AgentGuard policy not found' });
    await requireWorkspace(req, policy.workspaceId);
    await policy.deleteOne();
    res.json({ message: 'AgentGuard policy deleted', policyId: policy.policyId });
  } catch (error) { next(error); }
});

router.post('/members', allowRoles('Admin'), async (req, res, next) => {
  try {
    const workspaceId = workspaceFor(req);
    await requireWorkspace(req, workspaceId);
    const membership = await WorkspaceMembership.create({ workspaceId, userId: req.body.userId, role: req.body.role });
    res.status(201).json(membership);
  } catch (error) { next(error); }
});

router.get('/pending', async (req, res, next) => {
  try {
    const workspaceId = workspaceFor(req);
    await requireWorkspace(req, workspaceId);
    const actions = await AgentAction.find({ workspaceId, status: 'pending_approval' }).sort({ createdAt: -1 });

    const actionsWithContract = await Promise.all(actions.map(async (action) => {
      const contractId = action.contractId;
      if (!contractId || !/^[a-f0-9]{24}$/i.test(String(contractId))) {
        if (contractId) {
          console.warn(`[AgentGuard] GET /pending: skipping contract population for action ${action.actionId} with malformed contractId '${String(contractId)}'`);
        }
        return action;
      }
      try {
        await action.populate('contractId', 'title counterparty');
      } catch (error) {
        console.warn(`[AgentGuard] GET /pending: contract population failed for action ${action.actionId}: ${error.name}: ${error.message}`);
      }
      return action;
    }));

    res.json(actionsWithContract);
  } catch (error) {
    console.error('[AgentGuard] GET /pending failed:', { name: error.name, message: error.message, stack: error.stack });
    next(error);
  }
});

router.post('/actions/:id/approve', async (req, res, next) => {
  try {
    const action = await AgentAction.findOne({ _id: req.params.id, workspaceId: workspaceFor(req) });
    if (!action) return res.status(404).json({ message: 'AgentGuard action not found' });
    await requireWorkspace(req, action.workspaceId);
    if (action.status !== 'pending_approval') return res.status(409).json({ message: 'Action is not awaiting approval.' });
    if (String(action.proposal?.proposedBy || '') === String(req.user.id)) return res.status(403).json({ message: 'The proposer cannot approve their own action.' });
    if (!action.policySnapshot?.approval?.approverRoles?.includes(req.user.role)) return res.status(403).json({ message: 'Role is not allowed to approve this action.' });
    const response = await fetch(`${AI_SERVICE_URL}/agentguard/resume`, { method: 'POST', headers: aiInternalHeaders, body: JSON.stringify({ evaluationRunId: action.evaluationRunId, actionId: action.actionId, decision: 'approve', actorId: String(req.user.id), comment: req.body.comment || '' }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ message: result.detail || 'AgentGuard resume failed' });
    const approvedAction = await AgentAction.findOne({ _id: action._id });
    const executed = await executeAgentAction(approvedAction);
    await fetch(`${AI_SERVICE_URL}/agentguard/complete`, { method: 'POST', headers: aiInternalHeaders, body: JSON.stringify({ evaluationRunId: action.evaluationRunId, actionId: action.actionId, status: 'completed' }) });
    res.json({ action: executed, runStatus: 'completed', resumed: true });
  } catch (error) { next(error); }
});

router.post('/actions/:id/reject', async (req, res, next) => {
  try {
    const action = await AgentAction.findOne({ _id: req.params.id, workspaceId: workspaceFor(req) });
    if (!action) return res.status(404).json({ message: 'AgentGuard action not found' });
    await requireWorkspace(req, action.workspaceId);
    if (action.status !== 'pending_approval') return res.status(409).json({ message: 'Action is not awaiting approval.' });
    if (String(action.proposal?.proposedBy || '') === String(req.user.id)) return res.status(403).json({ message: 'The proposer cannot reject their own action.' });
    if (!action.policySnapshot?.approval?.approverRoles?.includes(req.user.role)) return res.status(403).json({ message: 'Role is not allowed to reject this action.' });
    const response = await fetch(`${AI_SERVICE_URL}/agentguard/resume`, { method: 'POST', headers: aiInternalHeaders, body: JSON.stringify({ evaluationRunId: action.evaluationRunId, actionId: action.actionId, decision: 'reject', actorId: String(req.user.id), comment: req.body.comment || '' }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ message: result.detail || 'AgentGuard resume failed' });
    res.json({ action: await AgentAction.findOne({ _id: action._id }), runStatus: 'completed', resumed: true });
  } catch (error) { next(error); }
});

router.post('/actions/:id/execute', async (req, res, next) => {
  try {
    const action = await AgentAction.findOne({ _id: req.params.id, workspaceId: workspaceFor(req) });
    if (!action) return res.status(404).json({ message: 'AgentGuard action not found' });
    await requireWorkspace(req, action.workspaceId);
    const executed = await executeAgentAction(action);
    res.json({ action: executed, runStatus: 'completed' });
  } catch (error) { next(error); }
});

export default router;
