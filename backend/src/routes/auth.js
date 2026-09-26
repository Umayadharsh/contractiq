import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';

const router = Router();

function issueToken(user) {
  return jwt.sign({ id: user._id.toString(), email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email is already registered' });
    // Every self-registered account is a Viewer, and any selectedRole in the
    // request body is ignored. Admin and Reviewer are fixed system roles: there
    // is exactly one of each, provisioned out of band. Previously the first user
    // to register was promoted to Admin and any later user could ask for
    // Reviewer, so both roles could be self-assigned and a second Admin or
    // Reviewer could be minted from the sign-up form.
    const role = 'Viewer';
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role });

    // Enrol the new account in the shared workspace as a Viewer. Workspace
    // resolution treats a membership as the caller's working workspace and
    // refuses an explicit workspace the caller does not belong to, so without
    // this row a freshly registered Viewer resolves to its own empty personal
    // workspace: the contract list comes back empty and naming the shared
    // workspace is refused with 403. A Viewer can therefore never read a single
    // approved contract. The owner needs no row -- the Admin's own id *is* the
    // workspace id -- so only non-owners get one.
    const owner = await User.findOne({ role: 'Admin' }).select('_id').lean();
    if (owner && String(owner._id) !== String(user._id)) {
      await WorkspaceMembership.create({ workspaceId: String(owner._id), userId: user._id, role: 'Viewer' });
    }
    res.status(201).json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password' });
    if (req.body.selectedRole && req.body.selectedRole !== user.role) return res.status(403).json({ message: 'Invalid role selected for this account.' });
    res.json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { next(error); }
});

export default router;