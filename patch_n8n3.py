with open("automation/workflows/risk-escalation.json", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    '"toEmail": "admin@example.com"',
    '"toEmail": "={{$json.body.recipients ? $json.body.recipients.join(\\",\\") : \\"admin@example.com\\"}}"'
)

with open("automation/workflows/risk-escalation.json", "w", encoding="utf-8") as f:
    f.write(text)
print("Updated risk-escalation.json")
