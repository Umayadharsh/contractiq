import { logAudit } from './auditLogger.js';


const N8N_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';

export async function triggerN8nWebhook(path, payload) {
  try {
    const url = `${N8N_URL}/${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await logAudit({ actor: 'System', actionType: 'n8n_trigger', decision: 'success', details: { webhookPath: path, payload } });
    if (!response.ok) {
      console.warn(`[n8n] Webhook ${path} returned ${response.status}`);
    }
  } catch (error) {
    console.error(`[n8n] Failed to trigger webhook ${path}:`, error.message);
  }
}
