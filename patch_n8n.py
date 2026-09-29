import os
import re

with open('backend/src/utils/n8n.js', 'r') as f:
    text = f.read()

if "import { logAudit }" not in text:
    text = "import { logAudit } from './auditLogger.js';\n" + text

old = "if (!response.ok) {"
new = "await logAudit({ actor: 'System', actionType: 'n8n_trigger', decision: 'success', details: { webhookPath: path, payload } });\n    if (!response.ok) {"

if new not in text:
    text = text.replace(old, new)

with open('backend/src/utils/n8n.js', 'w') as f:
    f.write(text)

with open('backend/src/routes/agentGuard.js', 'r') as f:
    ag = f.read()

ag = re.sub(
    r"(await policy\.save\(\);\s*)(res\.json\(policy\);\s*\} catch \(error\) \{ next\(error\); \}\s*\});\s*router\.delete",
    r"\1await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId: policy.workspaceId, actionType: 'edit_policy', decision: 'success', details: { policyId: policy.policyId } });\n      \2",
    ag
)
with open('backend/src/routes/agentGuard.js', 'w') as f:
    f.write(ag)

print("Patched n8n.js and agentGuard.js")
