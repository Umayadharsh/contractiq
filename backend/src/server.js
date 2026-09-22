import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'node:path';
import authRoutes from './routes/auth.js';
import contractRoutes from './routes/contracts.js';
import playbookRoutes from './routes/playbooks.js';
import agentGuardRoutes from './routes/agentGuard.js';

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const corsOptions = {
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(path.resolve('uploads')));
app.get('/', (_req, res) => res.json({ service: 'contractiq-guard-api', status: 'ok' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/playbooks', playbookRoutes);
app.use('/api/agentguard', agentGuardRoutes);
app.use((error, _req, res, _next) => res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : error.statusCode || 500).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'File must be 10MB or smaller' : error.statusCode ? error.message : 'Server error' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => app.listen(port, () => console.log(`Backend listening on port ${port}`)))
  .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1); });