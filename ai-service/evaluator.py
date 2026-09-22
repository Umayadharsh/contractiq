import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

TERMINAL_STATUSES = {"rejected", "completed", "failed", "cancelled", "blocked"}


def _now():
    return datetime.now(timezone.utc)


def request_fingerprint(action: dict[str, Any], context: dict[str, Any]) -> str:
    payload = {
        "workspaceId": action.get("workspaceId"),
        "contractId": action.get("contractId"),
        "evaluationRunId": action.get("evaluationRunId"),
        "type": action.get("type"),
        "payload": action.get("payload", {}),
        "assessmentIds": action.get("assessmentIds", []),
        "event": context.get("event"),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _matches(policy: dict[str, Any], action: dict[str, Any], context: dict[str, Any]) -> bool:
    if policy.get("workspaceId") != context.get("workspaceId"):
        return False
    if not policy.get("isActive", False):
        return False
    policy_action = policy.get("action", {})
    if policy_action.get("type") != action.get("type"):
        return False
    trigger = policy.get("trigger") or {}
    if trigger.get("event") and trigger["event"] != context.get("event"):
        return False
    assessments = context.get("assessments", [])
    if trigger.get("riskFlags") and not any(a.get("riskFlag") in trigger["riskFlags"] for a in assessments):
        return False
    if trigger.get("severities") and not any(a.get("severity") in trigger["severities"] for a in assessments):
        return False
    if trigger.get("ruleIds") and not any(a.get("citedRuleId") in trigger["ruleIds"] for a in assessments):
        return False
    if trigger.get("categories") and not any(a.get("category") in trigger["categories"] for a in assessments):
        return False
    return True


def _response(action: dict[str, Any], decision: str, status: str, run_status: str, policy: dict[str, Any] | None, reason: str) -> dict[str, Any]:
    approval = (policy or {}).get("approval") or {}
    return {
        "evaluationRunId": action["evaluationRunId"],
        "actionId": action["actionId"],
        "decision": decision,
        "actionStatus": status,
        "runStatus": run_status,
        "matchedPolicy": None if policy is None else {
            "policyId": policy["policyId"],
            "version": policy["version"],
            "decision": policy["decision"],
            "priority": policy.get("priority", 0),
        },
        "requiresHumanApproval": status == "pending_approval",
        "allowedApproverRoles": approval.get("approverRoles", []),
        "minApprovals": approval.get("minApprovals", 1),
        "reason": reason,
    }


def evaluate(action: dict[str, Any], context: dict[str, Any], database) -> dict[str, Any]:
    if action.get("workspaceId") != context.get("workspaceId") or action.get("contractId") != context.get("contractId"):
        return _persist(database, action, context, "invalid_scope", "blocked", "blocked", None, "Action and context workspace or contract do not match.")
    if action.get("evaluationRunId") != context.get("evaluationRunId"):
        return _persist(database, action, context, "invalid_run", "blocked", "blocked", None, "Action and context evaluation run do not match.")

    fingerprint = request_fingerprint(action, context)
    existing = database.agentActions.find_one({"actionId": action["actionId"]})
    if existing:
        if existing.get("requestFingerprint") == fingerprint:
            return existing["evaluatorResponse"]
        raise ValueError("actionId already used with a different request fingerprint")

    policies = list(database.agentPolicies.find({"workspaceId": context["workspaceId"], "isActive": True}))
    matches = [p for p in policies if _matches(p, action, context)]
    matches.sort(key=lambda p: (-p.get("priority", 0), -p.get("version", 1), p.get("policyId", "")))
    policy = matches[0] if matches else None

    if policy is None:
        return _persist(database, action, context, "default_deny", "blocked", "blocked", None, "No active policy matched the proposed action.", fingerprint)
    if policy.get("decision") == "deny":
        return _persist(database, action, context, "policy_deny", "blocked", "blocked", policy, "Matched policy explicitly denies this action.", fingerprint)
    if policy.get("decision") == "escalate" or (policy.get("approval") or {}).get("required") is True:
        return _persist(database, action, context, "escalate", "pending_approval", "waiting_for_approval", policy, "Matched policy requires human approval.", fingerprint)
    if policy.get("decision") == "auto_approve":
        return _persist(database, action, context, "auto_approve", "approved", "ready_for_execution", policy, "Matched active auto-approval policy.", fingerprint)
    return _persist(database, action, context, "invalid_policy", "blocked", "blocked", policy, "Matched policy has an invalid decision.", fingerprint)


def _persist(database, action, context, decision, status, run_status, policy, reason, fingerprint=None):
    fingerprint = fingerprint or request_fingerprint(action, context)
    snapshot = None if policy is None else {
        "policyId": policy["policyId"], "policyVersion": policy["version"], "decision": policy["decision"],
        "priority": policy.get("priority", 0), "trigger": policy.get("trigger", {}),
        "action": policy.get("action", {}), "approval": policy.get("approval", {}),
    }
    approval = (policy or {}).get("approval") or {}
    response = _response(action, decision, status, run_status, policy, reason)
    doc = {
        "actionId": action["actionId"], "workspaceId": action["workspaceId"], "contractId": action["contractId"],
        "policyId": None if policy is None else policy["policyId"], "policyVersion": None if policy is None else policy["version"],
        "evaluationRunId": action["evaluationRunId"], "type": action["type"], "status": status,
        "requestFingerprint": fingerprint, "proposal": action.get("proposal", {}), "policySnapshot": snapshot,
        "approval": {"required": approval.get("required", False), "decision": "pending" if status == "pending_approval" else "not_required"},
        "evaluatorResponse": response, "createdAt": _now(), "updatedAt": _now(),
    }
    try:
        database.agentActions.create_index([("actionId", ASCENDING)], unique=True)
        database.agentActions.insert_one(doc)
        database.agentRuns.update_one(
            {"evaluationRunId": action["evaluationRunId"]},
            {"$set": {"evaluationRunId": action["evaluationRunId"], "workspaceId": action["workspaceId"], "contractId": action["contractId"], "status": run_status, "state": {"action": action, "context": context, "decision": decision}, "updatedAt": _now()}, "$setOnInsert": {"createdAt": _now()}},
            upsert=True,
        )
    except DuplicateKeyError:
        existing = database.agentActions.find_one({"actionId": action["actionId"]})
        if existing and existing.get("requestFingerprint") == fingerprint:
            return existing["evaluatorResponse"]
        raise ValueError("actionId already used with a different request fingerprint")
    return response


def resume_evaluation_run(database, evaluation_run_id: str, action_id: str, decision: str, actor_id: str | None = None, comment: str = "") -> dict[str, Any]:
    run = database.agentRuns.find_one({"evaluationRunId": evaluation_run_id})
    action = database.agentActions.find_one({"actionId": action_id, "evaluationRunId": evaluation_run_id})
    if not run or not action:
        raise ValueError("Persisted evaluation run or action was not found")
    if action.get("status") != "pending_approval":
        raise ValueError("Evaluation run is not awaiting approval")

    now = _now()
    if decision == "approve":
        action_status = "approved"
        run_status = "ready_for_execution"
        approval_decision = "approved"
    elif decision == "reject":
        action_status = "rejected"
        run_status = "completed"
        approval_decision = "rejected"
    else:
        raise ValueError("Resume decision must be approve or reject")

    response = dict(action["evaluatorResponse"])
    response.update({"actionStatus": action_status, "runStatus": run_status, "decision": decision})
    database.agentActions.update_one(
        {"actionId": action_id},
        {"$set": {"status": action_status, "approval.decision": approval_decision, "approval.decidedBy": actor_id, "approval.decidedAt": now, "approval.comment": comment, "evaluatorResponse": response, "updatedAt": now}},
    )
    database.agentRuns.update_one(
        {"evaluationRunId": evaluation_run_id},
        {"$set": {"status": run_status, "state.resumeDecision": decision, "state.resumedBy": actor_id, "state.resumedAt": now, "updatedAt": now}},
    )
    response["resumed"] = True
    return response


def complete_evaluation_run(database, evaluation_run_id: str, action_id: str, status: str) -> dict[str, Any]:
    if status not in {"completed", "rejected"}:
        raise ValueError("Evaluation completion status is invalid")
    run = database.agentRuns.find_one({"evaluationRunId": evaluation_run_id})
    action = database.agentActions.find_one({"actionId": action_id, "evaluationRunId": evaluation_run_id})
    if not run or not action:
        raise ValueError("Persisted evaluation run or action was not found")
    run_status = "completed"
    database.agentRuns.update_one({"evaluationRunId": evaluation_run_id}, {"$set": {"status": run_status, "state.completion": status, "updatedAt": _now()}})
    return {"evaluationRunId": evaluation_run_id, "actionId": action_id, "runStatus": run_status, "actionStatus": action.get("status")}
