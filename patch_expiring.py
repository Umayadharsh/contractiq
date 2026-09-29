with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

target = """      const now = new Date();
      const result = [];
      for (const c of contracts) {"""

replacement = """      const now = new Date();
      const recipients = await getNotificationRecipients(workspaceId);
      const result = [];
      for (const c of contracts) {"""

target2 = """            uploaderEmail: c.uploadedBy?.email,
            endDate: endDate.toISOString().split('T')[0],
            daysRemaining: diffDays"""

replacement2 = """            uploaderEmail: c.uploadedBy?.email,
            endDate: endDate.toISOString().split('T')[0],
            daysRemaining: diffDays,
            recipients"""

if target in text and target2 in text:
    text = text.replace(target, replacement)
    text = text.replace(target2, replacement2)
    with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
