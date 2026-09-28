import re

with open("ai-service/main.py", "r") as f:
    content = f.read()

new_endpoint = """
@app.get("/diagnostic/gemini")
def diagnostic_gemini(secret: str = Depends(_require_internal_secret)):
    import os
    from google import genai
    from google.genai import types
    
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    
    result = {
        "configured": bool(api_key),
        "model": model_name,
        "success": False,
        "status_code": None,
        "error_type": None,
        "error_message": None,
    }
    
    if not api_key:
        return result
        
    try:
        client = genai.Client(api_key=api_key)
        prompt = 'Return JSON: {"ok": true}'
        
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        result["success"] = True
        result["status_code"] = 200
        result["error_message"] = response.text.strip()
    except Exception as exc:
        result["error_type"] = type(exc).__name__
        result["error_message"] = str(exc)
        if getattr(exc, 'code', None):
            result["status_code"] = exc.code
        elif getattr(exc, 'status_code', None):
            result["status_code"] = exc.status_code
        else:
            result["status_code"] = 500
            
    return result

"""

content += new_endpoint

with open("ai-service/main.py", "w") as f:
    f.write(content)
