import json
import os

workflows_dir = 'automation/workflows'
os.makedirs(workflows_dir, exist_ok=True)

# 1. new-upload-pipeline
new_upload_pipeline = {
  "name": "New Upload Pipeline",
  "nodes": [
    {
      "parameters": {
        "path": "new-upload",
        "httpMethod": "POST",
        "responseMode": "lastNode"
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "webhookId": "new-upload-trigger"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{$json.body.extractionUrl}}",
        "sendBody": True,
        "bodyParameters": {
          "parameters": [
            {"name": "contractId", "value": "={{$json.body.contractId}}"}
          ]
        }
      },
      "name": "Extract & Evaluate",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [450, 300]
    },
    {
      "parameters": {
        "subject": "Analysis Ready",
        "text": "The analysis for contract {{$node[\"Webhook\"].json[\"body\"][\"contractId\"]}} is ready.",
        "toEmail": "={{$node[\"Webhook\"].json[\"body\"][\"uploaderEmail\"]}}"
      },
      "name": "Notify Uploader",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [650, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [{"node": "Extract & Evaluate", "type": "main", "index": 0}]
      ]
    },
    "Extract & Evaluate": {
      "main": [
        [{"node": "Notify Uploader", "type": "main", "index": 0}]
      ]
    }
  },
  "settings": {}
}

# 2. renewal-reminder
renewal_reminder = {
  "name": "Renewal Reminder",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{"field": "days", "expression": 1}]
        }
      },
      "name": "Schedule",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "url": "http://contractiq-guard-api/api/contracts/expiring",
        "method": "GET"
      },
      "name": "Query Expiring Contracts",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [450, 300]
    },
    {
      "parameters": {
        "subject": "Contract Renewal Reminder",
        "text": "You have contracts expiring in 30/14/7 days.",
        "toEmail": "admin@example.com"
      },
      "name": "Send Reminder",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [650, 300]
    }
  ],
  "connections": {
    "Schedule": {
      "main": [[{"node": "Query Expiring Contracts", "type": "main", "index": 0}]]
    },
    "Query Expiring Contracts": {
      "main": [[{"node": "Send Reminder", "type": "main", "index": 0}]]
    }
  }
}

# 3. risk-escalation
risk_escalation = {
  "name": "Risk Escalation",
  "nodes": [
    {
      "parameters": {
        "path": "risk-escalation",
        "httpMethod": "POST",
        "responseMode": "lastNode"
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "webhookId": "risk-escalation-trigger"
    },
    {
      "parameters": {
        "channel": "#alerts",
        "text": "=CRITICAL RISK FLAGGED for contract {{$json.body.contractId}}: {{$json.body.riskDetails}}"
      },
      "name": "Slack Alert",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [450, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{"node": "Slack Alert", "type": "main", "index": 0}]]
    }
  }
}

# 4. weekly-digest
weekly_digest = {
  "name": "Weekly Digest",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{"field": "weeks", "expression": 1}]
        }
      },
      "name": "Schedule",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "url": "http://contractiq-guard-api/api/contracts/stats",
        "method": "GET"
      },
      "name": "Aggregate Stats",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 3,
      "position": [450, 300]
    },
    {
      "parameters": {
        "model": "gpt-4",
        "messages": {
          "messageValues": [
            {
              "content": "=Generate a weekly summary based on these stats: {{$json}}"
            }
          ]
        }
      },
      "name": "LLM Summary",
      "type": "n8n-nodes-base.openAi",
      "typeVersion": 1,
      "position": [650, 300]
    },
    {
      "parameters": {
        "subject": "Weekly Contract Digest",
        "text": "={{$json.message.content}}",
        "toEmail": "team@example.com"
      },
      "name": "Send Digest",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [850, 300]
    }
  ],
  "connections": {
    "Schedule": {
      "main": [[{"node": "Aggregate Stats", "type": "main", "index": 0}]]
    },
    "Aggregate Stats": {
      "main": [[{"node": "LLM Summary", "type": "main", "index": 0}]]
    },
    "LLM Summary": {
      "main": [[{"node": "Send Digest", "type": "main", "index": 0}]]
    }
  }
}

# 5. counterparty-followup
counterparty_followup = {
  "name": "Counterparty Followup",
  "nodes": [
    {
      "parameters": {
        "path": "counterparty-followup",
        "httpMethod": "POST",
        "responseMode": "lastNode"
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "webhookId": "counterparty-followup-trigger"
    },
    {
      "parameters": {
        "subject": "Contract Redline Approved",
        "text": "={{$json.body.emailBody}}",
        "toEmail": "={{$json.body.counterpartyEmail}}"
      },
      "name": "Send Redline Email",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [450, 300]
    },
    {
      "parameters": {
        "amount": 7,
        "unit": "days"
      },
      "name": "Wait 7 Days",
      "type": "n8n-nodes-base.wait",
      "typeVersion": 1,
      "position": [650, 300]
    },
    {
      "parameters": {
        "subject": "Follow Up: Contract Redline",
        "text": "Just following up on the redline we sent 7 days ago.",
        "toEmail": "={{$node[\"Webhook\"].json[\"body\"][\"counterpartyEmail\"]}}"
      },
      "name": "Send Followup",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [850, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{"node": "Send Redline Email", "type": "main", "index": 0}]]
    },
    "Send Redline Email": {
      "main": [[{"node": "Wait 7 Days", "type": "main", "index": 0}]]
    },
    "Wait 7 Days": {
      "main": [[{"node": "Send Followup", "type": "main", "index": 0}]]
    }
  }
}

workflows = {
  "new-upload-pipeline.json": new_upload_pipeline,
  "renewal-reminder.json": renewal_reminder,
  "risk-escalation.json": risk_escalation,
  "weekly-digest.json": weekly_digest,
  "counterparty-followup.json": counterparty_followup
}

for filename, data in workflows.items():
  with open(os.path.join(workflows_dir, filename), "w") as f:
    json.dump(data, f, indent=2)

print("Created JSON workflows.")
