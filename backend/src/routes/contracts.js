import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Contract from '../models/Contract.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({
  dest: path.resolve('uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype))
});

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

router.post('/', allowRoles('Admin', 'Reviewer'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'A PDF or Word document is required' });
    const contract = await Contract.create({ title: req.body.title, counterparty: req.body.counterparty, uploadedBy: req.user.id, fileUrl: `/uploads/${req.file.filename}`, workspaceId: req.body.workspaceId || req.user.id });
    res.status(201).json(contract);
  } catch (error) { next(error); }
});

export default router;