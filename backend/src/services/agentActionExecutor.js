import AgentAction from '../models/AgentAction.js';
import Contract from '../models/Contract.js';

import { triggerN8nWebhook } from '../utils/n8n.js';

export async function executeAgentAction(action) {
  if (action.status !== 'approved') {
    const error = new Error('Only approved actions can execute.');
    error.statusCode = 409;
    throw error;
  }

  action.status = 'executing';
  action.execution.startedAt = new Date();
  await action.save();

  try {
    if (action.type === 'send_redline_email') {
      const contract = await Contract.findOne({ _id: action.contractId, workspaceId: action.workspaceId });
      const counterpartyEmail = action.proposal?.requestedChanges?.counterpartyEmail || (contract ? contract.counterparty + '@example.com' : 'unknown@example.com');
      const emailBody = action.proposal?.requestedChanges?.emailBody || 'Please review the attached redlines.';
      
      triggerN8nWebhook('counterparty-followup', {
        contractId: action.contractId,
        counterpartyEmail,
        emailBody
      });
      
      action.status = 'completed';
      action.execution.completedAt = new Date();
      action.execution.result = { emailSent: true, to: counterpartyEmail };
      await action.save();
      return action;
    }

    if (action.type !== 'update_contract') {
      const error = new Error(`Unsupported AgentGuard action type: ${action.type}`);
      error.statusCode = 400;
      throw error;
    }

    const contract = await Contract.findOne({ _id: action.contractId, workspaceId: action.workspaceId });
    if (!contract) {
      const error = new Error('Target contract not found.');
      error.statusCode = 404;
      throw error;
    }

    const report = action.proposal?.requestedChanges?.complianceReport;
    if (report === undefined) {
      const error = new Error('AgentGuard action has no compliance report to persist.');
      error.statusCode = 400;
      throw error;
    }

    contract.complianceReport = report;
    await contract.save();
    action.status = 'completed';
    action.execution.completedAt = new Date();
    action.execution.result = { contractId: String(contract._id), updated: 'complianceReport' };
    await action.save();
    return action;
  } catch (error) {
    action.status = 'failed';
    action.execution.completedAt = new Date();
    action.execution.error = error.message;
    await action.save();
    throw error;
  }
}
