import json
import os
import random
from datetime import datetime, timedelta

CONTRACTS_DIR = "tests/evaluation/sample_contracts"
os.makedirs(CONTRACTS_DIR, exist_ok=True)

types = ["Service Agreement", "NDA", "Software Agreement", "Vendor Agreement", "Employment Agreement", "Licensing Agreement", "Purchase Agreement", "Data Processing Agreement", "Master Service Agreement", "Consulting Agreement"]
laws = ["New York", "California", "Delaware", "Texas", "England and Wales", "Washington"]
payment_terms = ["Net 30", "Net 45", "Net 60", "Due on receipt", "Net 15"]
liability_limits = ["$10,000", "$50,000", "Amount paid in the past 12 months", "1x Contract Value", "Unlimited"]
parties_pool = [
    ("Acme Corp", "Beta Solutions"),
    ("Global Tech", "Startup Inc"),
    ("MegaCorp", "SmallBiz"),
    ("DataWorks", "CloudHost"),
    ("Alpha LLC", "Omega Partners")
]

labels = {}
rag_questions = []
agentguard_scenarios = []

for i in range(1, 26):
    contract_id = f"contract{i:02d}"
    filename = f"{contract_id}.txt"
    filepath = os.path.join(CONTRACTS_DIR, filename)
    
    ctype = random.choice(types)
    law = random.choice(laws)
    term = random.choice(payment_terms)
    p1, p2 = random.choice(parties_pool)
    liability = random.choice(liability_limits)
    contract_val = f"${random.randint(5, 500) * 1000}"
    
    start_dt = datetime(2026, random.randint(1, 6), random.randint(1, 28))
    end_dt = start_dt + timedelta(days=365)
    
    # Contract Text
    text = f"--- {ctype.upper()} ---\n\n"
    text += f"This {ctype} is entered into as of {start_dt.strftime('%B %d, %Y')} (the 'Start Date') between {p1} and {p2}.\n\n"
    text += f"1. GOVERNING LAW\nThis agreement shall be governed by the laws of {law}.\n\n"
    text += f"2. PAYMENT TERMS\nThe total contract value is {contract_val}. Payment is {term}.\n\n"
    text += f"3. LIABILITY LIMIT\nLiability is capped at {liability}.\n\n"
    text += f"4. TERM\nThis agreement terminates on {end_dt.strftime('%B %d, %Y')} (the 'End Date').\n\n"
    text += f"5. CONFIDENTIALITY\nBoth parties agree to maintain strict confidentiality of all data shared.\n\n"

    with open(filepath, "w") as f:
        f.write(text)

    # Extraction Labels
    labels[filename] = {
        "parties": [p1, p2],
        "contractValue": contract_val,
        "startDate": start_dt.strftime('%Y-%m-%d'),
        "endDate": end_dt.strftime('%Y-%m-%d'),
        "governingLaw": law,
        "paymentTerms": term,
        "liabilityLimit": liability
    }

    # RAG Questions
    # In my RAG evaluation I will just use text matching for expectedClauseText if clauseId is not easily guessable
    # Or I can just check if the answer contains keywords
    rag_questions.append({
        "contractId": contract_id,
        "question": f"What is the liability limit?",
        "expectedAnswerKeywords": [liability]
    })
    rag_questions.append({
        "contractId": contract_id,
        "question": f"What is the governing law?",
        "expectedAnswerKeywords": [law]
    })

# AgentGuard Scenarios
scenarios = [
    {
        "action": {"actionId": "ag-1", "type": "delete_contract", "payload": {}},
        "context": {"userRole": "Viewer"},
        "expectedDecision": "block"
    },
    {
        "action": {"actionId": "ag-2", "type": "approve_contract", "payload": {}},
        "context": {"userRole": "Reviewer"},
        "expectedDecision": "allow"
    },
    {
        "action": {"actionId": "ag-3", "type": "modify_policy", "payload": {}},
        "context": {"userRole": "Admin"},
        "expectedDecision": "allow"
    },
    {
        "action": {"actionId": "ag-4", "type": "update_contract", "payload": {}},
        "context": {"userRole": "Reviewer"},
        "expectedDecision": "escalate",
        "database": [{"policyId": "POL-1", "decision": "escalate"}]
    }
]

# Write labels
with open("tests/evaluation/extraction_labels.json", "w") as f:
    json.dump(labels, f, indent=2)

# Write RAG
with open("tests/evaluation/rag_questions.json", "w") as f:
    json.dump(rag_questions, f, indent=2)

# Write AG
with open("tests/evaluation/agentguard_scenarios.json", "w") as f:
    json.dump(scenarios, f, indent=2)

print("Dataset generated successfully.")
