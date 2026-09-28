import re

with open("ai-service/test_extraction.py", "r") as f:
    content = f.read()

content = content.replace(
    "assert response.json()['detail']['message'] == 'Gemini extraction service is unavailable.'",
    "assert response.json()['detail'] == 'Gemini extraction temporarily unavailable after retries'"
)
content = content.replace(
    "assert 'Gemini extraction service is unavailable' in response.json()['detail']['message']",
    "assert 'temporarily unavailable after retries' in response.json()['detail']"
)

with open("ai-service/test_extraction.py", "w") as f:
    f.write(content)
