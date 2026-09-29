with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

import re

# Replace /expiring
text = re.sub(
    r"router\.get\('/expiring'.*?\}\);",
    """router.get('/expiring', async (req, res, next) => {
    try {
      const workspaceId = await resolveWorkspace(req);
      const contracts = await Contract.find({ workspaceId }).populate('uploadedBy', 'email name');
      
      const now = new Date();
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
            daysRemaining: diffDays
          });
        }
      }
      
      res.json(result);
    } catch (error) { next(error); }
  });""",
    text,
    flags=re.DOTALL | re.MULTILINE,
    count=1
)

# Replace /stats
text = re.sub(
    r"router\.get\('/stats'.*?\}\);",
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
      
      res.json({ 
        total: contracts.length, 
        approved, 
        rejected, 
        waitingForEvaluation, 
        waitingForApproval, 
        criticalMajorRisks, 
        approachingRenewal 
      });
    } catch (error) { next(error); }
  });""",
    text,
    flags=re.DOTALL | re.MULTILINE,
    count=1
)

with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
    f.write(text)
print("Regex replace applied")
