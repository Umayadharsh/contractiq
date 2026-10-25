import json
import os

scenarios = []

# Base context and action
base_ws = "ws-1"
base_contract = "con-1"
base_run = "run-123"

# 1. No policies -> default_deny
scenarios.append({
    "action": {"type": "upload_contract"},
    "context": {"event": "upload"},
    "database": [],
    "expectedDecision": "block",
    "description": "No policies, defaults to deny"
})

# 2. Simple auto_approve match
scenarios.append({
    "action": {"type": "upload_contract"},
    "context": {"event": "upload", "workspaceId": base_ws},
    "database": [{
        "policyId": "P1", "isActive": True, "workspaceId": base_ws,
        "action": {"type": "upload_contract"}, "trigger": {"event": "upload"},
        "decision": "auto_approve"
    }],
    "expectedDecision": "allow",
    "description": "Simple auto_approve policy matches event"
})

# 3. Explicit deny overrides (via priority)
scenarios.append({
    "action": {"type": "delete_contract"},
    "context": {"event": "delete", "workspaceId": base_ws},
    "database": [
        {"policyId": "P1", "isActive": True, "workspaceId": base_ws, "action": {"type": "delete_contract"}, "decision": "auto_approve", "priority": 1},
        {"policyId": "P2", "isActive": True, "workspaceId": base_ws, "action": {"type": "delete_contract"}, "decision": "deny", "priority": 10}
    ],
    "expectedDecision": "block",
    "description": "High priority deny overrides low priority allow"
})

# 4. Inactive policy is ignored
scenarios.append({
    "action": {"type": "upload_contract"},
    "context": {"event": "upload", "workspaceId": base_ws},
    "database": [
        {"policyId": "P1", "isActive": False, "workspaceId": base_ws, "action": {"type": "upload_contract"}, "decision": "auto_approve"}
    ],
    "expectedDecision": "block",
    "description": "Inactive policy is ignored, results in default deny"
})

# 5. Escalate based on riskFlag
scenarios.append({
    "action": {"type": "evaluate_contract"},
    "context": {"event": "evaluate", "workspaceId": base_ws, "assessments": [{"riskFlag": "Deviation"}]},
    "database": [
        {"policyId": "P1", "isActive": True, "workspaceId": base_ws, "action": {"type": "evaluate_contract"}, "trigger": {"riskFlags": ["Deviation"]}, "decision": "escalate"}
    ],
    "expectedDecision": "escalate",
    "description": "Escalates when context assessment has specific riskFlag"
})

# 6. Escalate based on severity Critical
scenarios.append({
    "action": {"type": "evaluate_contract"},
    "context": {"event": "evaluate", "workspaceId": base_ws, "assessments": [{"severity": "Critical"}]},
    "database": [
        {"policyId": "P1", "isActive": True, "workspaceId": base_ws, "action": {"type": "evaluate_contract"}, "trigger": {"severities": ["Critical"]}, "decision": "escalate"}
    ],
    "expectedDecision": "escalate",
    "description": "Escalates on Critical severity"
})

# 7. Approvals required -> escalate
scenarios.append({
    "action": {"type": "modify_policy"},
    "context": {"event": "modify", "workspaceId": base_ws},
    "database": [
        {"policyId": "P1", "isActive": True, "workspaceId": base_ws, "action": {"type": "modify_policy"}, "decision": "auto_approve", "approval": {"required": True}}
    ],
    "expectedDecision": "escalate",
    "description": "Even if decision is auto_approve, approval required -> escalate"
})

# 8. Mismatched workspace
scenarios.append({
    "action": {"type": "upload_contract"},
    "context": {"event": "upload", "workspaceId": "ws-2"},
    "database": [
        {"policyId": "P1", "isActive": True, "workspaceId": base_ws, "action": {"type": "upload_contract"}, "decision": "auto_approve"}
    ],
    "expectedDecision": "block",
    "description": "Policy workspace does not match context workspace"
})

# 9. Matching category
scenarios.append({
    "action": {"type": "sign_contract"},
    "context": {"event": "sign", "workspaceId": base_ws, "assessments": [{"category": "Finance"}]},
    "database": [
        {"policyId": "P1", "isActive": True, "workspaceId": base_ws, "action": {"type": "sign_contract"}, "trigger": {"categories": ["Finance"]}, "decision": "auto_approve"}
    ],
    "expectedDecision": "allow",
    "description": "Matches on specific category"
})

# 10. Missing category (should block)
scenarios.append({
    "action": {"type": "sign_contract"},
    "context": {"event": "sign", "workspaceId": base_ws, "assessments": [{"category": "Legal"}]},
    "database": [
        {"policyId": "P1", "isActive": True, "workspaceId": base_ws, "action": {"type": "sign_contract"}, "trigger": {"categories": ["Finance"]}, "decision": "auto_approve"}
    ],
    "expectedDecision": "block",
    "description": "Does not match required category"
})

# Add another 10 variations
for i in range(11, 21):
    scenarios.append({
        "action": {"type": f"action_{i}"},
        "context": {"event": f"event_{i}", "workspaceId": base_ws},
        "database": [{
            "policyId": f"P{i}", "isActive": True, "workspaceId": base_ws,
            "action": {"type": f"action_{i}"}, "trigger": {"event": f"event_{i}"},
            "decision": "auto_approve" if i % 2 == 0 else "escalate"
        }],
        "expectedDecision": "allow" if i % 2 == 0 else "escalate",
        "description": f"Generated realistic scenario {i}"
    })

with open("tests/evaluation/agentguard_scenarios.json", "w") as f:
    json.dump(scenarios, f, indent=2)

print("20 scenarios written.")
