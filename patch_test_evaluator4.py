import re

with open('ai-service/test_evaluator.py', 'r') as f:
    text = f.read()

text = text.replace(
    "if self.find_one({'actionId': document['actionId']}):",
    "if 'actionId' in document and self.find_one({'actionId': document['actionId']}):"
)

with open('ai-service/test_evaluator.py', 'w') as f:
    f.write(text)

print("Patched FakeCollection in test_evaluator.py")
