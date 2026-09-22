import copy

import pytest

from evaluator import evaluate, request_fingerprint


class FakeCollection:
    def __init__(self):
        self.documents = []

    def find_one(self, query):
        return next((doc for doc in self.documents if all(doc.get(key) == value for key, value in query.items())), None)

    def find(self, query):
        return [doc for doc in self.documents if all(doc.get(key) == value for key, value in query.items())]

    def insert_one(self, document):
        if self.find_one({'actionId': document['actionId']}):
            from pymongo.errors import DuplicateKeyError
            raise DuplicateKeyError('duplicate actionId')
        self.documents.append(copy.deepcopy(document))

    def create_index(self, *_args, **_kwargs):
        return None

    def update_one(self, query, update, upsert=False):
        document = self.find_one(query)
        if document is None and upsert:
            document = {key: value for key, value in query.items()}
            self.documents.append(document)
        if document:
            document.update(update.get('$set', {}))
            document.update(update.get('$setOnInsert', {}))


class FakeDatabase:
    def __init__(self, policies):
        self.agentPolicies = FakeCollection()
        self.agentPolicies.documents = copy.deepcopy(policies)
        self.agentActions = FakeCollection()
        self.agentRuns = FakeCollection()


def action(action_id='action-1', workspace='workspace-1', payload=None):
    return {
        'actionId': action_id,
        'type': 'notify',
        'payload': payload or {'message': 'review required'},
        'contractId': 'contract-1',
        'workspaceId': workspace,
        'evaluationRunId': 'run-1',
        'assessmentIds': ['assessment-1'],
        'proposal': {'reason': 'Major risk', 'proposedBy': 'user-1'},
    }


def context(workspace='workspace-1', event='compliance_evaluation_completed'):
    return {
        'event': event,
        'workspaceId': workspace,
        'contractId': 'contract-1',
        'evaluationRunId': 'run-1',
        'assessments': [{'assessmentId': 'assessment-1', 'riskFlag': 'Non-Compliant', 'severity': 'Major', 'citedRuleId': 'RULE-1', 'category': 'termination'}],
    }


def policy(policy_id='POLICY-1', decision='auto_approve', priority=1, version=1, workspace='workspace-1', active=True):
    return {
        'policyId': policy_id,
        'workspaceId': workspace,
        'isActive': active,
        'priority': priority,
        'version': version,
        'trigger': {'event': 'compliance_evaluation_completed', 'riskFlags': ['Non-Compliant']},
        'decision': decision,
        'action': {'type': 'notify', 'payloadTemplate': {}},
        'approval': {'required': decision == 'escalate', 'approverRoles': ['Admin'], 'minApprovals': 1},
    }


def test_auto_approved_low_risk_action():
    result = evaluate(action(), context(), FakeDatabase([policy()]))
    assert result['decision'] == 'auto_approve'
    assert result['actionStatus'] == 'approved'
    assert result['runStatus'] == 'ready_for_execution'


def test_escalated_high_risk_action():
    result = evaluate(action(), context(), FakeDatabase([policy(decision='escalate')]))
    assert result['decision'] == 'escalate'
    assert result['actionStatus'] == 'pending_approval'
    assert result['runStatus'] == 'waiting_for_approval'


def test_no_matching_policy_defaults_to_blocked_without_execution():
    database = FakeDatabase([])
    result = evaluate(action(), context(), database)
    assert result['decision'] == 'default_deny'
    assert result['actionStatus'] == 'blocked'
    assert result['runStatus'] == 'blocked'
    assert len(database.agentActions.documents) == 1


def test_explicit_policy_deny():
    result = evaluate(action(), context(), FakeDatabase([policy(decision='deny')]))
    assert result['decision'] == 'policy_deny'
    assert result['actionStatus'] == 'blocked'


def test_policy_precedence_uses_priority_then_version_then_policy_id():
    database = FakeDatabase([policy('LOW', 'escalate', 1), policy('HIGH', 'auto_approve', 2)])
    assert evaluate(action(), context(), database)['matchedPolicy']['policyId'] == 'HIGH'
    database = FakeDatabase([policy('OLD', 'escalate', 2, 1), policy('NEW', 'auto_approve', 2, 2)])
    assert evaluate(action(), context(), database)['matchedPolicy']['policyId'] == 'NEW'
    database = FakeDatabase([policy('Z', 'escalate', 2, 2), policy('A', 'auto_approve', 2, 2)])
    assert evaluate(action(), context(), database)['matchedPolicy']['policyId'] == 'A'


def test_inactive_and_different_workspace_policies_do_not_match():
    database = FakeDatabase([policy('INACTIVE', active=False), policy('OTHER', workspace='workspace-2')])
    result = evaluate(action(), context(), database)
    assert result['decision'] == 'default_deny'


def test_idempotency_returns_existing_result_and_conflicts_on_new_fingerprint():
    database = FakeDatabase([policy()])
    first = evaluate(action(), context(), database)
    second = evaluate(action(), context(), database)
    assert second == first
    with pytest.raises(ValueError, match='different request fingerprint'):
        evaluate(action(payload={'message': 'changed'}), context(), database)


def test_policy_snapshot_is_persisted():
    database = FakeDatabase([policy(decision='escalate', priority=7, version=3)])
    evaluate(action(), context(), database)
    snapshot = database.agentActions.documents[0]['policySnapshot']
    assert snapshot['policyId'] == 'POLICY-1'
    assert snapshot['policyVersion'] == 3
    assert snapshot['priority'] == 7
    assert snapshot['decision'] == 'escalate'
