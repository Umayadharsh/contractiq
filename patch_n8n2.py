with open("automation/workflows/renewal-reminder.json", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    '"toEmail": "={{$json.uploaderEmail}}"',
    '"toEmail": "={{$json.recipients ? $json.recipients.join(\\",\\") : $json.uploaderEmail}}"'
)

with open("automation/workflows/renewal-reminder.json", "w", encoding="utf-8") as f:
    f.write(text)
print("Updated renewal-reminder.json")
