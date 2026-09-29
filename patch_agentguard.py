import os

def patch_file(filepath, imports, replacements):
    with open(filepath, 'r') as f:
        text = f.read()
    
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new)
        else:
            print(f"Warning: could not find replacement target in {filepath}:\n{old[:30]}...")
            
    if imports and "logAudit" not in text:
        text = text.replace("import { Router } from 'express';", f"import {{ Router }} from 'express';\n{imports}")
        
    with open(filepath, 'w') as f:
        f.write(text)

ag_replacements = [
    (
        "res.status(201).json(policy);",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId, actionType: 'create_policy', decision: 'success', details: { policyId: policy.policyId } });\n      res.status(201).json(policy);"
    ),
    (
        "res.json(policy);\n    } catch (error) { next(error); }\n  });\n  \n  router.delete",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId: policy.workspaceId, actionType: 'edit_policy', decision: 'success', details: { policyId: policy.policyId } });\n      res.json(policy);\n    } catch (error) { next(error); }\n  });\n  \n  router.delete"
    ),
    (
        "res.json({ message: 'AgentGuard policy deleted', policyId: policy.policyId });",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId: policy.workspaceId, actionType: 'delete_policy', decision: 'success', details: { policyId: policy.policyId } });\n      res.json({ message: 'AgentGuard policy deleted', policyId: policy.policyId });"
    ),
    (
        "res.json({ action: executed, runStatus: 'completed', resumed: true });",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId: action.workspaceId, actionType: 'human_approve', decision: 'approved', details: { actionId: action.actionId, contractId: action.contractId } });\n      res.json({ action: executed, runStatus: 'completed', resumed: true });"
    ),
    (
        "res.json({ action: await AgentAction.findOne({ _id: action._id }), runStatus: 'completed', resumed: true });",
        "await logAudit({ actor: req.user.id, actorEmail: req.user.email, workspaceId: action.workspaceId, actionType: 'human_reject', decision: 'rejected', details: { actionId: action.actionId, contractId: action.contractId } });\n      res.json({ action: await AgentAction.findOne({ _id: action._id }), runStatus: 'completed', resumed: true });"
    )
]
patch_file('backend/src/routes/agentGuard.js', "import { logAudit } from '../utils/auditLogger.js';", ag_replacements)

print("Patched agentGuard.js")
