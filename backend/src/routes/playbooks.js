import { Router } from 'express';
import PlaybookRule from '../models/PlaybookRule.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function syncPlaybookEmbeddings(workspaceId) {
  try {
    const rules = await PlaybookRule.find({ workspaceId, isActive: true });
    await fetch(`${AI_SERVICE_URL}/index-playbook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        rules: rules.map((r) => ({
          ruleId: r.ruleId,
          title: r.title,
          category: r.category,
          description: r.description,
          expectedRequirement: r.expectedRequirement,
          severity: r.severity,
          fallbackText: r.fallbackText,
        })),
      }),
    });
  } catch (error) {
    console.warn(`Playbook indexing sync failed: ${error.message}`);
  }
}

router.use(requireAuth);

// GET /api/playbooks - List rules for current workspace
router.get('/', async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId || req.user.id;
    const filter = { workspaceId };
    if (req.query.all !== 'true') {
      filter.isActive = true;
    }
    const rules = await PlaybookRule.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(rules);
  } catch (error) {
    next(error);
  }
});

// GET /api/playbooks/:id - Get single rule by ID
router.get('/:id', async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId || req.user.id;
    const rule = await PlaybookRule.findOne({ _id: req.params.id, workspaceId })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    if (!rule) return res.status(404).json({ message: 'Playbook rule not found' });
    res.json(rule);
  } catch (error) {
    next(error);
  }
});

// POST /api/playbooks - Create new rule (Admin only)
router.post('/', allowRoles('Admin'), async (req, res, next) => {
  try {
    const workspaceId = req.body.workspaceId || req.user.id;
    const { ruleId, title, category, description, expectedRequirement, severity, fallbackText, isActive } = req.body;

    if (!ruleId || !title || !category || !description || !expectedRequirement) {
      return res.status(400).json({ message: 'ruleId, title, category, description, and expectedRequirement are required.' });
    }

    const existing = await PlaybookRule.findOne({ workspaceId, ruleId: String(ruleId).toUpperCase().trim() });
    if (existing) {
      return res.status(409).json({ message: `A playbook rule with ruleId '${ruleId}' already exists in this workspace.` });
    }

    const newRule = await PlaybookRule.create({
      ruleId: String(ruleId).toUpperCase().trim(),
      title: title.trim(),
      category: category.toLowerCase().trim(),
      description: description.trim(),
      expectedRequirement: expectedRequirement.trim(),
      severity: severity || 'Major',
      fallbackText: fallbackText ? fallbackText.trim() : '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      workspaceId,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    syncPlaybookEmbeddings(workspaceId);
    res.status(201).json(newRule);
  } catch (error) {
    next(error);
  }
});

// PUT /api/playbooks/:id - Update existing rule (Admin only)
router.put('/:id', allowRoles('Admin'), async (req, res, next) => {
  try {
    const workspaceId = req.body.workspaceId || req.user.id;
    const rule = await PlaybookRule.findOne({ _id: req.params.id, workspaceId });
    if (!rule) return res.status(404).json({ message: 'Playbook rule not found' });

    const fields = ['title', 'category', 'description', 'expectedRequirement', 'severity', 'fallbackText', 'isActive'];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        if (field === 'category') rule.category = req.body.category.toLowerCase().trim();
        else if (field === 'severity') rule.severity = req.body.severity;
        else if (field === 'isActive') rule.isActive = Boolean(req.body.isActive);
        else rule[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    }
    rule.updatedBy = req.user.id;

    await rule.save();
    syncPlaybookEmbeddings(workspaceId);
    res.json(rule);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/playbooks/:id - Delete rule (Admin only)
router.delete('/:id', allowRoles('Admin'), async (req, res, next) => {
  try {
    const workspaceId = req.query.workspaceId || req.user.id;
    const rule = await PlaybookRule.findOneAndDelete({ _id: req.params.id, workspaceId });
    if (!rule) return res.status(404).json({ message: 'Playbook rule not found' });
    syncPlaybookEmbeddings(workspaceId);
    res.json({ message: 'Playbook rule deleted successfully', ruleId: rule.ruleId });
  } catch (error) {
    next(error);
  }
});

export default router;
