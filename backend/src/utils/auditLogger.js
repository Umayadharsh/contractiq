import AuditLog from '../models/AuditLog.js';

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
