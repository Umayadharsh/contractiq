import os
import sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parent))
from main import _extract_with_llm, _create_embeddings

print("API Key configured:", bool(os.getenv("GEMINI_API_KEY")))

try:
    print("Testing extraction...")
    result = _extract_with_llm("This is a simple Service Agreement between ACME and Beta Corp starting 2026-01-01.")
    print("Extraction successful!")
except Exception as e:
    print("Extraction failed:", e)

try:
    print("Testing embeddings...")
    embeddings = _create_embeddings(["This is a test document."])
    print("Embeddings successful! Length:", len(embeddings))
except Exception as e:
    print("Embeddings failed:", e)
