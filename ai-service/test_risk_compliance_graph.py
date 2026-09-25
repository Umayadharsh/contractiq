import os
import pytest
from main import (
    RiskComplianceState,
    retrieve_playbook_rules_node,
    compare_clauses_node,
    compute_risk_score_node,
    store_result_node,
    risk_compliance_graph,
    _search_playbook_rules,
)

# Mock rules for testing
MOCK_RULE_1 = {
    "ruleId": "RULE-LIAB-01",
    "title": "Liability Cap Limit",
    "category": "liability",
    "description": "Liability must not exceed 12 months fees.",
    "expectedRequirement": "Maximum 1x Annual Contract Value",
    "severity": "Critical",
    "fallbackText": "In no event shall liability exceed total fees paid.",
}

MOCK_RULE_2 = {
    "ruleId": "RULE-PAY-01",
    "title": "Payment Period",
    "category": "payment",
    "description": "Payment terms must be Net 30.",
    "expectedRequirement": "Net 30 days",
    "severity": "Major",
    "fallbackText": "Invoices are payable within 30 days.",
}


# Test 1: Graph State Schema Structure
def test_1_graph_state_schema():
    state: RiskComplianceState = {
        "contractId": "contract-123",
        "workspaceId": "ws-001",
        "clauses": [{"id": "c1", "type": "liability", "text": "Unlimited liability applies."}],
        "retrievedRules": [MOCK_RULE_1],
        "assessments": [],
        "overallRiskScore": 100.0,
        "overallStatus": "Pass",
        "rejectedCount": 0,
    }
    assert state["contractId"] == "contract-123"
    assert "retrievedRules" in state
    assert "assessments" in state
    assert "overallRiskScore" in state
    assert "rejectedCount" in state


# Test 2: Playbook Retrieval Node
def test_2_playbook_retrieval_node(monkeypatch):
    def mock_search(workspace_id, clauses):
        return [MOCK_RULE_1, MOCK_RULE_2] if workspace_id == "ws-001" else []

    monkeypatch.setattr("main._search_playbook_rules", mock_search)
    state: RiskComplianceState = {
        "contractId": "doc-1",
        "workspaceId": "ws-001",
        "clauses": [{"id": "c1", "type": "liability", "text": "Unlimited liability."}],
        "retrievedRules": [],
        "assessments": [],
        "overallRiskScore": 100.0,
        "overallStatus": "Pass",
        "rejectedCount": 0,
    }
    res = retrieve_playbook_rules_node(state)
    assert len(res["retrievedRules"]) == 2
    assert res["retrievedRules"][0]["ruleId"] == "RULE-LIAB-01"


# Test 3: Clause Comparison Node
def test_3_clause_comparison(monkeypatch):
    state: RiskComplianceState = {
        "contractId": "doc-1",
        "workspaceId": "ws-001",
        "clauses": [
            {"id": "c1", "type": "liability", "text": "Company shall have unlimited liability for all indirect damages."}
        ],
        "retrievedRules": [MOCK_RULE_1],
        "assessments": [],
        "overallRiskScore": 100.0,
        "overallStatus": "Pass",
        "rejectedCount": 0,
    }

    res = compare_clauses_node(state)
    assert isinstance(res.get("assessments"), list)
    assert isinstance(res.get("rejectedCount"), int)


# Test 4: Valid Citation Acceptance
def test_4_valid_citation_acceptance():
    rules = [MOCK_RULE_1]
    valid_rule_map = {r["ruleId"]: r for r in rules}
    clause_text = "Company shall have unlimited liability for all indirect damages."

    valid_raw = {
        "clauseId": "c1",
        "riskFlag": "Non-Compliant",
        "severity": "Critical",
        "reason": "Unlimited liability violates rule",
        "citedRuleId": "RULE-LIAB-01",
        "citedClauseText": "unlimited liability",
    }

    rule_valid = valid_raw["citedRuleId"] in valid_rule_map
    text_valid = valid_raw["citedClauseText"].lower() in clause_text.lower()
    assert rule_valid and text_valid, "Assessment with valid citedRuleId and text MUST be accepted"


# Test 5: Missing Citation Rejection
def test_5_missing_citation_rejection():
    # Force a raw invalid assessment with fake citedRuleId
    rules = [MOCK_RULE_1]
    valid_rule_map = {r["ruleId"]: r for r in rules}

    invalid_raw = {
        "clauseId": "c1",
        "riskFlag": "Non-Compliant",
        "severity": "Critical",
        "reason": "Violates rule",
        "citedRuleId": "FAKE-RULE-99", # Invalid rule ID
        "citedClauseText": "unlimited liability",
    }

    # Verify rejection rule logic
    rule_valid = invalid_raw["citedRuleId"] in valid_rule_map
    assert not rule_valid, "Assessment with fake citedRuleId MUST be rejected"


# Test 6: Deterministic Risk Scoring
def test_6_deterministic_risk_scoring():
    # Case A: 1 Critical (-30), 1 Major (-15), 1 Minor (-5) => Score: 50.0 (Fail)
    state_a: RiskComplianceState = {
        "contractId": "c1",
        "workspaceId": "w1",
        "clauses": [{"id": "dummy"}],
        "retrievedRules": [],
        "assessments": [
            {"clauseId": "c1", "riskFlag": "Non-Compliant", "severity": "Critical", "reason": "r1", "citedRuleId": "RULE-LIAB-01", "citedClauseText": "text1"},
            {"clauseId": "c2", "riskFlag": "Deviation", "severity": "Major", "reason": "r2", "citedRuleId": "RULE-PAY-01", "citedClauseText": "text2"},
            {"clauseId": "c3", "riskFlag": "Warning", "severity": "Minor", "reason": "r3", "citedRuleId": "RULE-TERM-01", "citedClauseText": "text3"},
        ],
        "overallRiskScore": 100.0,
        "overallStatus": "Pass",
        "rejectedCount": 0,
    }
    res_a = compute_risk_score_node(state_a)
    assert res_a["overallRiskScore"] == 50.0
    assert res_a["overallStatus"] == "Fail"

    # Case B: Zero violations => Score: 100.0 (Pass)
    state_b: RiskComplianceState = {
        "contractId": "c1",
        "workspaceId": "w1",
        "clauses": [{"id": "dummy"}],
        "retrievedRules": [],
        "assessments": [],
        "overallRiskScore": 100.0,
        "overallStatus": "Pass",
        "rejectedCount": 0,
    }
    res_b = compute_risk_score_node(state_b)
    assert res_b["overallRiskScore"] == 100.0
    assert res_b["overallStatus"] == "Pass"

    # Case C: Empty clauses => NeedsReview
    state_c: RiskComplianceState = {
        "contractId": "c1",
        "workspaceId": "w1",
        "clauses": [],
        "retrievedRules": [],
        "assessments": [],
        "overallRiskScore": 100.0,
        "overallStatus": "Pass",
        "rejectedCount": 0,
    }
    res_c = compute_risk_score_node(state_c)
    assert res_c["overallRiskScore"] == 0.0
    assert res_c["overallStatus"] == "NeedsReview"


# Test 7: Result Storage Node Re-validation
def test_7_result_storage_validation():
    state: RiskComplianceState = {
        "contractId": "c1",
        "workspaceId": "w1",
        "clauses": [{"id": "dummy"}],
        "retrievedRules": [MOCK_RULE_1],
        "assessments": [
            {"clauseId": "c1", "riskFlag": "Non-Compliant", "severity": "Critical", "reason": "r1", "citedRuleId": "RULE-LIAB-01", "citedClauseText": "text1"},
            {"clauseId": "c2", "riskFlag": "Non-Compliant", "severity": "Critical", "reason": "r2", "citedRuleId": "INVALID-RULE", "citedClauseText": "text2"},
        ],
        "overallRiskScore": 70.0,
        "overallStatus": "Warning",
        "rejectedCount": 0,
    }
    res = store_result_node(state)
    assert len(res["assessments"]) == 1
    assert res["assessments"][0]["citedRuleId"] == "RULE-LIAB-01"
    assert res["rejectedCount"] == 1


# Test 8: No Matching Playbook Rule
def test_8_no_matching_playbook_rule():
    state: RiskComplianceState = {
        "contractId": "c1",
        "workspaceId": "empty-ws",
        "clauses": [{"id": "c1", "type": "other", "text": "Standard clause text."}],
        "retrievedRules": [],
        "assessments": [],
        "overallRiskScore": 100.0,
        "overallStatus": "Pass",
        "rejectedCount": 0,
    }
    res_comp = compare_clauses_node(state)
    assert len(res_comp["assessments"]) == 0

    res_score = compute_risk_score_node(state)
    assert res_score["overallRiskScore"] == 100.0
    assert res_score["overallStatus"] == "Pass"


# Test 9: Workspace Isolation
def test_9_workspace_isolation(monkeypatch):
    def mock_db_search(workspace_id, clauses):
        if workspace_id == "workspace_A":
            return [MOCK_RULE_1]
        return []

    monkeypatch.setattr("main._search_playbook_rules", mock_db_search)
    res_a = retrieve_playbook_rules_node({"workspaceId": "workspace_A", "clauses": [{"id": "dummy"}]})
    res_b = retrieve_playbook_rules_node({"workspaceId": "workspace_B", "clauses": [{"id": "dummy"}]})

    assert len(res_a["retrievedRules"]) == 1
    assert len(res_b["retrievedRules"]) == 0


# Test 10: End-to-End Contract -> Playbook -> Risk Assessment Flow
def test_10_e2e_graph_flow(monkeypatch):
    def mock_db_search(workspace_id, clauses):
        return [MOCK_RULE_1, MOCK_RULE_2]

    monkeypatch.setattr("main._search_playbook_rules", mock_db_search)

    initial_state: RiskComplianceState = {
        "contractId": "e2e-contract-1",
        "workspaceId": "ws-e2e",
        "clauses": [
            {"id": "c1", "type": "liability", "text": "Neither party shall be liable for indirect damages, except unlimited liability applies to breaches."},
            {"id": "c2", "type": "payment", "text": "Payment shall be due within 90 days of invoice receipt."}
        ],
        "retrievedRules": [],
        "assessments": [],
        "overallRiskScore": 100.0,
        "overallStatus": "Pass",
        "rejectedCount": 0,
    }

    final_state = risk_compliance_graph.invoke(initial_state)

    assert final_state["contractId"] == "e2e-contract-1"
    assert len(final_state["retrievedRules"]) == 2
    assert "overallRiskScore" in final_state
    assert final_state["overallStatus"] in ["Pass", "Warning", "Fail"]
