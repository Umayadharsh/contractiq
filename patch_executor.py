with open("backend/src/services/agentActionExecutor.js", "r", encoding="utf-8") as f:
    text = f.read()

target = """      triggerN8nWebhook('counterparty-followup', {
        contractId: action.contractId,
        counterpartyEmail,
        emailBody
      });"""

replacement = """      triggerN8nWebhook('counterparty-followup', {
        contractId: action.contractId,
        counterparty: contract ? contract.counterparty : 'Unknown',
        recipientEmail: counterpartyEmail,
        approvedContent: emailBody,
        approvalInfo: {
          approvedBy: action.approval?.decidedBy,
          approvedAt: action.approval?.decidedAt
        }
      });"""

if target in text:
    text = text.replace(target, replacement)
    with open("backend/src/services/agentActionExecutor.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
