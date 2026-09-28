import re

with open("ai-service/main.py", "r") as f:
    content = f.read()

# Fix _is_transient_gemini_error
old_transient = """def _is_transient_gemini_error(error: Exception) -> bool:
    if isinstance(error, genai_errors.APIError) and 500 <= error.code < 600:
        return True
    if "timeout" in str(error).lower() or type(error).__name__ in ["TimeoutException", "ReadTimeout", "ConnectTimeout"]:
        return True
    return False"""

new_transient = """def _is_transient_gemini_error(error: Exception) -> bool:
    if getattr(error, 'code', None) in (429, 500, 502, 503, 504):
        return True
    if isinstance(error, genai_errors.APIError) and 500 <= error.code < 600:
        return True
    if "timeout" in str(error).lower() or type(error).__name__ in ["TimeoutException", "ReadTimeout", "ConnectTimeout"]:
        return True
    return False"""

content = content.replace(old_transient, new_transient)

# Replace the loop
loop_pattern = re.compile(r"    for attempt in range\(3\):\n.*?            raise HTTPException\(\n                status_code=503,\n                detail=\{\n                    \"message\": \"Gemini extraction service is unavailable\.\",\n                    \"error_type\": type\(exc\)\.__name__,\n                    \"error\": str\(exc\),\n                \},\n            \) from exc", re.DOTALL)

new_loop = """    for attempt in range(4):
        try:
            response = _gemini_client().models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=_gemini_response_schema(),
                ),
            )
            break
        except HTTPException:
            raise
        except Exception as exc:
            if _is_transient_gemini_error(exc) and attempt < 3:
                backoff_delays = [2.0, 5.0, 10.0]
                delay = backoff_delays[attempt] + random.uniform(0, 0.5)
                print(f"Gemini extraction retry {attempt + 1}/3 after {type(exc).__name__}; waiting {delay:.2f}s")
                time.sleep(delay)
                continue

            print(f"Gemini extraction error: {type(exc).__name__}: {exc}")
            raise HTTPException(
                status_code=503,
                detail="Gemini extraction temporarily unavailable after retries",
            ) from exc"""

content = loop_pattern.sub(new_loop, content)

with open("ai-service/main.py", "w") as f:
    f.write(content)
