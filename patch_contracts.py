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

ct_replacements = [
    (
        "return res.status(201).json({",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId: contract.workspaceId, actionType: 'upload_contract', decision: 'success', details: { contractId: contract._id, title: contract.title } });\n        return res.status(201).json({"
    )
]
patch_file('backend/src/routes/contracts.js', "import { logAudit } from '../utils/auditLogger.js';", ct_replacements)

print("Patched contracts.js")
