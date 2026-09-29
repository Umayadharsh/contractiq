with open("ai-service/main.py", "r", encoding="utf-8") as f:
    text = f.read()

target = """@app.post("/agentguard/complete")"""

replacement = """class StatsSummaryRequest(BaseModel):
    stats: dict[str, Any]

@app.post("/summarize-stats")
def summarize_stats(payload: StatsSummaryRequest):
    client = get_gemini_client()
    prompt = f"Please write a concise, professional management summary of these weekly contract statistics. Highlight any critical areas needing attention:\\n\\n{json.dumps(payload.stats, indent=2)}"
    response = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
        contents=prompt,
    )
    return {"summary": response.text}

@app.post("/agentguard/complete")"""

if target in text:
    text = text.replace(target, replacement)
    with open("ai-service/main.py", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
