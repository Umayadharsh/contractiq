import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { resolveWorkspace } from '../utils/workspace.js';

const router = Router();

router.use(requireAuth);

router.get('/', allowRoles('Admin'), async (req, res, next) => {
  try {
    const workspaceId = await resolveWorkspace(req);
    const { actor, actionType, decision, startDate, endDate, search, page = 1, limit = 50 } = req.query;

    const query = { workspaceId };

    if (actor) query.actorEmail = new RegExp(actor, 'i');
    if (actionType) query.actionType = actionType;
    if (decision) query.decision = decision;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { actorEmail: new RegExp(search, 'i') },
        { actionType: new RegExp(search, 'i') },
        { decision: new RegExp(search, 'i') },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(Number(limit)),
      AuditLog.countDocuments(query)
    ]);

    res.json({
      logs,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
