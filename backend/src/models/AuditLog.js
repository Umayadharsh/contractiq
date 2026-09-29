import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actor: { type: String, required: true },
  actorEmail: { type: String, default: '' },
  workspaceId: { type: String, default: 'default' },
  actionType: { type: String, required: true },
  decision: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('AuditLog', auditLogSchema, 'auditLogs');
