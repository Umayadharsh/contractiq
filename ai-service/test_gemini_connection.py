import os
import sys
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Load environment variables
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("Error: GEMINI_API_KEY not found in environment")
    sys.exit(1)

def test_model(model_name: str):
    print(f"Testing model: {model_name}")
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
        print(f"{model_name} -> Success: {response.text.strip()}")
        return True
    except Exception as exc:
        print(f"{model_name} -> Error: {type(exc).__name__}")
        print(f"Message: {str(exc)}")
        if getattr(exc, 'code', None):
            print(f"HTTP/API Code: {exc.code}")
        return False

def main():
    model_1 = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    test_model(model_1)
    
    print("-" * 40)
    
    model_2 = "gemini-3.5-flash-lite"
    test_model(model_2)

if __name__ == "__main__":
    main()
