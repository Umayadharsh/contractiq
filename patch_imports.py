with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

target = "import { resolveWorkspace } from '../utils/workspace.js';"
replacement = "import { resolveWorkspace, getNotificationRecipients } from '../utils/workspace.js';"

if target in text:
    text = text.replace(target, replacement)
    with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
