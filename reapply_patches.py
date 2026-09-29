with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

import re

# 1. Add getNotificationRecipients
text = text.replace("import { resolveWorkspace } from '../utils/workspace.js';", "import { resolveWorkspace, getNotificationRecipients } from '../utils/workspace.js';")

# 2. Replace /expiring
text = re.sub(
    r"router\.get\('/expiring', async \(req, res, next\) => \{.*?res\.json\(result\);\n    \} catch \(error\) \{ next\(error\); \}\n  \}\);",
    """router.get('/expiring', async (req, res, next) => {
    try {
      const workspaceId = await resolveWorkspace(req);
      const contracts = await Contract.find({ workspaceId }).populate('uploadedBy', 'email name');
      
      const now = new Date();
      const recipients = await getNotificationRecipients(workspaceId);
      const result = [];
      for (const c of contracts) {
        const endDateStr = c.extractedFields?.endDate || c.extractedFields?.['End Date'] || c.extractedFields?.expirationDate;
        if (!endDateStr) continue;
        const endDate = new Date(endDateStr);
        if (isNaN(endDate.getTime())) continue;
        
        const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if ([30, 14, 7].includes(diffDays)) {
          result.push({
            contractId: c._id,
            title: c.title,
            counterparty: c.counterparty,
            uploaderEmail: c.uploadedBy?.email,
            endDate: endDate.toISOString().split('T')[0],
            daysRemaining: diffDays,
            recipients
          });
        }
      }
      
      res.json(result);
    } catch (error) { next(error); }
  });""",
    text,
    flags=re.DOTALL
)

# 3. Replace /stats
text = re.sub(
    r"router\.get\('/stats', async \(req, res, next\) => \{.*?res\.json\(\{ total, reviewed, needsReview, failed \}\);\n    \} catch \(error\) \{ next\(error\); \}\n  \}\);",
    """router.get('/stats', async (req, res, next) => {
    try {
      const workspaceId = await resolveWorkspace(req);
      const contracts = await Contract.find({ workspaceId });
      
      let approved = 0;
      let rejected = 0;
      let waitingForEvaluation = 0;
      let waitingForApproval = 0;
      let criticalMajorRisks = 0;
      let approachingRenewal = 0;
      const now = new Date();

      for (const c of contracts) {
        if (c.status === 'Approved') approved++;
        if (c.status === 'Rejected') rejected++;
        if (c.status === 'Waiting for Evaluation' || c.status === 'NeedsReview') waitingForEvaluation++;
        if (c.status === 'Waiting for Approval') waitingForApproval++;
        
        if (c.complianceReport?.overallStatus?.toLowerCase() === 'critical' || c.complianceReport?.overallStatus?.toLowerCase() === 'major') {
          criticalMajorRisks++;
        }

        const endDateStr = c.extractedFields?.endDate || c.extractedFields?.['End Date'] || c.extractedFields?.expirationDate;
        if (endDateStr) {
          const endDate = new Date(endDateStr);
          if (!isNaN(endDate.getTime())) {
            const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 30 && diffDays > 0) approachingRenewal++;
          }
        }
      }
      
      const stats = {
        total: contracts.length, 
        approved, 
        rejected, 
        waitingForEvaluation, 
        waitingForApproval, 
        criticalMajorRisks, 
        approachingRenewal 
      };

      let summary = '';
      try {
        const aiResponse = await fetch(`${AI_SERVICE_URL}/summarize-stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.AI_INTERNAL_SECRET || '' },
          body: JSON.stringify({ stats })
        });
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          summary = aiData.summary;
        }
      } catch (err) {
        console.error('Failed to fetch AI summary:', err);
      }

      const recipients = await getNotificationRecipients(workspaceId);
      res.json({ ...stats, summary, recipients });
    } catch (error) { next(error); }
  });""",
    text,
    flags=re.DOTALL
)

# 4. Replace evaluate-compliance
text = re.sub(
    r"triggerN8nWebhook\('new-upload', \{",
    """triggerN8nWebhook('new-upload', {
      recipients: await getNotificationRecipients(workspaceId, req.user.id),""",
    text
)

text = re.sub(
    r"triggerN8nWebhook\('risk-escalation', \{\s*contractId: contract\._id\.toString\(\),\s*contractTitle: contract\.title,\s*counterparty: contract\.counterparty,\s*riskSeverity: 'Critical',\s*riskReason: criticalAssessment\?\.analysis \|\| 'Overall critical status',\s*citedRule: criticalAssessment\?\.ruleId \|\| 'N/A',\s*citedClause: criticalAssessment\?\.clauseText \|\| 'N/A'\s*\}\);",
    """triggerN8nWebhook('risk-escalation', {
        contractId: contract._id.toString(),
        contractTitle: contract.title,
        counterparty: contract.counterparty,
        riskSeverity: 'Critical',
        riskReason: criticalAssessment?.analysis || 'Overall critical status',
        citedRule: criticalAssessment?.ruleId || 'N/A',
        citedClause: criticalAssessment?.clauseText || 'N/A',
        recipients: await getNotificationRecipients(workspaceId, req.user.id)
      });""",
    text
)

with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
    f.write(text)
print("Regex replace applied")
