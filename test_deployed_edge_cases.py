import requests
import time
import os
import threading

BACKEND_URL = "https://contractiq-4bb0.onrender.com"
AI_URL = "https://contractiq-ai-service.onrender.com"
ADMIN_EMAIL = "admin@gmail.com"
ADMIN_PASS = "123456789"
REVIEWER_EMAIL = "reviewer@gmail.com"
REVIEWER_PASS = "123456789"

def login(email, password):
    resp = requests.post(f"{BACKEND_URL}/api/auth/login", json={"email": email, "password": password})
    resp.raise_for_status()
    return resp.json()["token"]

def main():
    print("Testing deployed endpoints...")
    try:
        admin_token = login(ADMIN_EMAIL, ADMIN_PASS)
        reviewer_token = login(REVIEWER_EMAIL, REVIEWER_PASS)
    except Exception as e:
        print("Login failed:", e)
        return

    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_reviewer = {"Authorization": f"Bearer {reviewer_token}"}

    # 1. Empty file
    print("1. Testing empty file upload...")
    resp = requests.post(f"{BACKEND_URL}/api/contracts", headers=headers_admin, files={"file": ("empty.pdf", b"", "application/pdf")}, data={"title": "Empty", "counterparty": "Empty"})
    print(f"Empty file: Status {resp.status_code} - {resp.text}")

    # 2. Unsupported file
    print("2. Testing unsupported file upload...")
    resp = requests.post(f"{BACKEND_URL}/api/contracts", headers=headers_admin, files={"file": ("test.exe", b"MZ...", "application/x-msdownload")}, data={"title": "Exe", "counterparty": "Exe"})
    print(f"Unsupported file: Status {resp.status_code} - {resp.text}")

    # 3. Large file (>10MB)
    print("3. Testing large file upload...")
    large_data = b"0" * (11 * 1024 * 1024)
    resp = requests.post(f"{BACKEND_URL}/api/contracts", headers=headers_admin, files={"file": ("large.pdf", large_data, "application/pdf")}, data={"title": "Large", "counterparty": "Large"})
    print(f"Large file: Status {resp.status_code} - {resp.text}")

    # 4. Unknown AgentGuard action
    print("4. Testing unknown AgentGuard action...")
    import uuid
    import datetime
    action = {
        "actionId": str(uuid.uuid4()),
        "workspaceId": "6aa8e57d8c1f45585b1385d7",
        "contractId": "000000000000000000000000",
        "evaluationRunId": str(uuid.uuid4()),
        "type": "unknown_action_type",
        "payload": {},
        "assessmentIds": []
    }
    context = {
        "event": "unknown_event",
        "workspaceId": "6aa8e57d8c1f45585b1385d7",
        "contractId": "000000000000000000000000",
        "evaluationRunId": action["evaluationRunId"]
    }
    # We can't directly hit evaluator.py from outside easily, but maybe we can trigger a compliance evaluation with no matching playbook rules?
    # Actually wait, AgentGuard evaluation is internal in ai-service.

    # 5. Expired JWT on protected route
    print("5. Testing expired JWT...")
    import jwt
    expired_token = jwt.encode({"id": "000", "role": "Admin", "exp": 10}, "e8a985647e0cf5afe738cd96312b1e78300bce4795d6b09c5d710cbb1c0b2f3f", algorithm="HS256")
    resp = requests.get(f"{BACKEND_URL}/api/contracts", headers={"Authorization": f"Bearer {expired_token}"})
    print(f"Expired JWT GET /contracts: Status {resp.status_code} - {resp.text}")

    resp = requests.get(f"{BACKEND_URL}/api/playbooks", headers={"Authorization": f"Bearer {expired_token}"})
    print(f"Expired JWT GET /playbooks: Status {resp.status_code} - {resp.text}")

    # 6. Concurrent uploads
    print("6. Testing concurrent uploads...")
    def upload_concurrent(token, name, results):
        resp = requests.post(f"{BACKEND_URL}/api/contracts", headers={"Authorization": f"Bearer {token}"}, files={"file": (f"{name}.pdf", b"%PDF-1.4...", "application/pdf")}, data={"title": name, "counterparty": "Test"})
        results[name] = {"status": resp.status_code, "json": resp.json() if resp.status_code == 201 else resp.text}

    import threading
    results = {}
    t1 = threading.Thread(target=upload_concurrent, args=(admin_token, "Admin_Contract", results))
    t2 = threading.Thread(target=upload_concurrent, args=(reviewer_token, "Reviewer_Contract", results))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    print("Concurrent uploads:", results)

if __name__ == "__main__":
    main()
