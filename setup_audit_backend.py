import os

model_code = """import mongoose from 'mongoose';

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
"""

logger_code = """import AuditLog from '../models/AuditLog.js';

export async function logAudit({ actor, actorEmail, workspaceId, actionType, decision, details }) {
  try {
    await AuditLog.create({
      actor: actor || 'System',
      actorEmail: actorEmail || '',
      workspaceId: workspaceId || 'default',
      actionType,
      decision: decision || '',
      details: details || {}
    });
  } catch (error) {
    console.error('[AuditLogger] Failed to write audit log:', error.message);
  }
}
"""

with open('backend/src/models/AuditLog.js', 'w') as f:
    f.write(model_code)

with open('backend/src/utils/auditLogger.js', 'w') as f:
    f.write(logger_code)

print("Created Model and Logger")
