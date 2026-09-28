with open("ai-service/main.py", "r") as f:
    text = f.read()

target = """@app.get("/diagnostic/gemini")
from fastapi import Depends
def diagnostic_gemini(secret: str = Depends(_require_internal_secret)):"""

replacement = """@app.get("/diagnostic/gemini")
def diagnostic_gemini(x_internal_secret: str | None = Header(default=None)):
    _require_internal_secret(x_internal_secret)"""

text = text.replace(target, replacement)

with open("ai-service/main.py", "w") as f:
    f.write(text)
