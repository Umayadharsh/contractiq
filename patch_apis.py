with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

expiring_target = """  router.get('/expiring', async (req, res, next) => {
    try {
      const workspaceId = await resolveWorkspace(req);
      const contracts = await Contract.find({ workspaceId }).select('title counterparty extractedFields');
      
      const now = new Date();
      const result = contracts.filter(c => {
        const endDateStr = c.extractedFields?.endDate || c.extractedFields?.['End Date'];
        if (!endDateStr) return false;
        const endDate = new Date(endDateStr);
        if (isNaN(endDate)) return false;
        
        const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
        return [30, 14, 7].includes(diffDays) || (diffDays <= 30 && diffDays > 0);
      });
      
      res.json(result);
    } catch (error) { next(error); }
  });"""

expiring_replacement = """  router.get('/expiring', async (req, res, next) => {
    try {
      const workspaceId = await resolveWorkspace(req);
      const contracts = await Contract.find({ workspaceId }).populate('uploadedBy', 'email name');
      
      const now = new Date();
      const result = [];
      for (const c of contracts) {
        const endDateStr = c.extractedFields?.endDate || c.extractedFields?.['End Date'];
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
  });"""

stats_target = """  router.get('/stats', async (req, res, next) => {
    try {
      const workspaceId = await resolveWorkspace(req);
      const total = await Contract.countDocuments({ workspaceId });
      const reviewed = await Contract.countDocuments({ workspaceId, status: 'Reviewed' });
      const needsReview = await Contract.countDocuments({ workspaceId, status: 'NeedsReview' });
      const failed = await Contract.countDocuments({ workspaceId, status: 'Failed' });
      
      res.json({ total, reviewed, needsReview, failed });
    } catch (error) { next(error); }
  });"""

stats_replacement = """  router.get('/stats', async (req, res, next) => {
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

        const endDateStr = c.extractedFields?.endDate || c.extractedFields?.['End Date'];
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
  });"""

if expiring_target in text:
    text = text.replace(expiring_target, expiring_replacement)
else:
    print("expiring_target not found")

if stats_target in text:
    text = text.replace(stats_target, stats_replacement)
else:
    print("stats_target not found")

with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
    f.write(text)
print("Success")
