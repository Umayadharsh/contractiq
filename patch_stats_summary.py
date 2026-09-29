with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

target = """      res.json({ 
        total: contracts.length, 
        approved, 
        rejected, 
        waitingForEvaluation, 
        waitingForApproval, 
        criticalMajorRisks, 
        approachingRenewal 
      });"""

replacement = """      const stats = {
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

      res.json({ ...stats, summary });"""

if target in text:
    text = text.replace(target, replacement)
    with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
