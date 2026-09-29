with open("ai-service/main.py", "r", encoding="utf-8") as f:
    text = f.read()

target = """@app.post("/summarize-stats")
def summarize_stats(payload: StatsSummaryRequest):
    client = get_gemini_client()"""

replacement = """@app.post("/summarize-stats")
def summarize_stats(payload: StatsSummaryRequest, x_internal_secret: str | None = Header(default=None)):
    _require_internal_secret(x_internal_secret)
    client = get_gemini_client()"""

if target in text:
    text = text.replace(target, replacement)
    with open("ai-service/main.py", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
