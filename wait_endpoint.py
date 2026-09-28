import time
import requests

url = "https://contractiq-ai-service.onrender.com/diagnostic/gemini"
headers = {"X-Internal-Secret": "shared-internal-secret"}

for i in range(60):
    try:
        response = requests.get(url, headers=headers)
        print(f"Status: {response.status_code} - {response.text}")
        if response.status_code == 200:
            with open("result.json", "w") as f:
                f.write(response.text)
            print("SUCCESS")
            break
    except Exception as e:
        print(f"Error: {e}")
    time.sleep(15)
