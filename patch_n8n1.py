with open("automation/workflows/new-upload-pipeline.json", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    '"toEmail": "={{$json.body.uploaderEmail}}"',
    '"toEmail": "={{$json.body.recipients ? $json.body.recipients.join(\\",\\") : $json.body.uploaderEmail}}"'
)

with open("automation/workflows/new-upload-pipeline.json", "w", encoding="utf-8") as f:
    f.write(text)
print("Updated new-upload-pipeline.json")
