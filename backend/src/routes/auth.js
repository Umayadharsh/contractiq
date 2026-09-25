import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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
    const isFirstUser = !(await User.exists({}));
    const requestedRole = req.body.selectedRole || 'Viewer';
    const role = isFirstUser ? 'Admin' : (['Viewer', 'Reviewer'].includes(requestedRole) ? requestedRole : 'Viewer');
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role });
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