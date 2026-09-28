import re

with open("ai-service/main.py", "r") as f:
    content = f.read()

# The endpoint added was from "@app.get(\"/diagnostic/gemini\")" to the end of the file.
content = re.sub(r"@app\.get\(\"/diagnostic/gemini\"\).*$", "", content, flags=re.DOTALL)

with open("ai-service/main.py", "w") as f:
    f.write(content)
