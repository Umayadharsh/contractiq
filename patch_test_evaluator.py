import os

with open('ai-service/test_evaluator.py', 'r') as f:
    text = f.read()

old = """class FakeDatabase:
    def __init__(self, policies=None, runs=None, actions=None):
        self.agentPolicies = FakeCollection(policies)
        self.agentRuns = FakeCollection(runs)
        self.agentActions = FakeCollection(actions)"""
new = """class FakeDatabase:
    def __init__(self, policies=None, runs=None, actions=None):
        self.agentPolicies = FakeCollection(policies)
        self.agentRuns = FakeCollection(runs)
        self.agentActions = FakeCollection(actions)
        self.auditLogs = FakeCollection()"""

if old in text:
    text = text.replace(old, new)
    with open('ai-service/test_evaluator.py', 'w') as f:
        f.write(text)
    print("Patched test_evaluator.py")
else:
    print("Could not find target in test_evaluator.py")
