import os

def patch_file(filepath, imports, replacements):
    with open(filepath, 'r') as f:
        text = f.read()
    
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new)
        else:
            print(f"Warning: could not find replacement target in {filepath}")
            
    if imports and "logAudit" not in text:
        text = text.replace("import { Router } from 'express';", f"import {{ Router }} from 'express';\n{imports}")
        
    with open(filepath, 'w') as f:
        f.write(text)

# Patch playbooks.js
pb_replacements = [
    (
        "res.status(201).json(newRule);",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId, actionType: 'create_playbook_rule', decision: 'success', details: { ruleId: newRule.ruleId } });\n    res.status(201).json(newRule);"
    ),
    (
        "res.json(rule);",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId, actionType: 'edit_playbook_rule', decision: 'success', details: { ruleId: rule.ruleId } });\n    res.json(rule);"
    ),
    (
        "res.json({ message: 'Playbook rule deleted successfully', ruleId: rule.ruleId });",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId, actionType: 'delete_playbook_rule', decision: 'success', details: { ruleId: rule.ruleId } });\n    res.json({ message: 'Playbook rule deleted successfully', ruleId: rule.ruleId });"
    )
]
patch_file('backend/src/routes/playbooks.js', "import { logAudit } from '../utils/auditLogger.js';", pb_replacements)

print("Patched playbooks.js")
