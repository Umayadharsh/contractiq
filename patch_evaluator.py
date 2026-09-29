import os

with open('ai-service/evaluator.py', 'r') as f:
    text = f.read()

old = "        database.agentActions.insert_one(doc)"
new = """        database.agentActions.insert_one(doc)
        
        # Log to auditLogs
        database.auditLogs.insert_one({
            "actor": "AgentGuard AI",
            "actorEmail": "ai-agent@contractiq.local",
            "workspaceId": action.get("workspaceId", "default"),
            "actionType": "agent_decision",
            "decision": decision,
            "details": {
                "actionId": action_id,
                "contractId": action.get("contractId"),
                "policyId": doc.get("policySnapshot", {}).get("policyId") if doc.get("policySnapshot") else None
            },
            "timestamp": _now()
        })
"""

if old in text:
    text = text.replace(old, new)
    with open('ai-service/evaluator.py', 'w') as f:
        f.write(text)
    print("Patched evaluator.py")
else:
    print("Could not find insert_one target")
