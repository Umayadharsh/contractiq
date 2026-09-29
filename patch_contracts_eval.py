with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

import re

# 1. Add getNotificationRecipients
text = text.replace("import { resolveWorkspace } from '../utils/workspace.js';", "import { resolveWorkspace, getNotificationRecipients } from '../utils/workspace.js';")

# 2. Add recipients to evaluate-compliance webhooks
text = re.sub(
    r"triggerN8nWebhook\('new-upload', \{",
    """triggerN8nWebhook('new-upload', {
      recipients: await getNotificationRecipients(workspaceId, req.user.id),""",
    text
)

text = re.sub(
    r"triggerN8nWebhook\('risk-escalation', \{\s*contractId: contract\._id\.toString\(\),\s*contractTitle: contract\.title,\s*counterparty: contract\.counterparty,\s*riskSeverity: 'Critical',\s*riskReason: criticalAssessment\?\.analysis \|\| 'Overall critical status',\s*citedRule: criticalAssessment\?\.ruleId \|\| 'N/A',\s*citedClause: criticalAssessment\?\.clauseText \|\| 'N/A'\s*\}\);",
    """triggerN8nWebhook('risk-escalation', {
        contractId: contract._id.toString(),
        contractTitle: contract.title,
        counterparty: contract.counterparty,
        riskSeverity: 'Critical',
        riskReason: criticalAssessment?.analysis || 'Overall critical status',
        citedRule: criticalAssessment?.ruleId || 'N/A',
        citedClause: criticalAssessment?.clauseText || 'N/A',
        recipients: await getNotificationRecipients(workspaceId, req.user.id)
      });""",
    text
)

with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
    f.write(text)
print("Regex replace applied")
