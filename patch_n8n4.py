with open("automation/workflows/weekly-digest.json", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    '"toEmail": "admin@example.com"',
    '"toEmail": "={{$json.recipients ? $json.recipients.join(\\",\\") : \\"admin@example.com\\"}}"'
)

with open("automation/workflows/weekly-digest.json", "w", encoding="utf-8") as f:
    f.write(text)
print("Updated weekly-digest.json")
