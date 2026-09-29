import re

with open('ai-service/test_evaluator.py', 'r') as f:
    text = f.read()

text = re.sub(
    r"(self\.agentRuns = FakeCollection\(\))",
    r"\1\n        self.auditLogs = FakeCollection()",
    text
)

with open('ai-service/test_evaluator.py', 'w') as f:
    f.write(text)

print("Patched test_evaluator.py")
