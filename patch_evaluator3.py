import re

with open('ai-service/evaluator.py', 'r') as f:
    text = f.read()

text = text.replace('"actionId": action_id,', '"actionId": action.get("actionId"),')

with open('ai-service/evaluator.py', 'w') as f:
    f.write(text)

print("Fixed evaluator.py actionId")
