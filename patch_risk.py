with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

target = """    const hasCriticalRisk = body.assessments?.some(a => String(a.severity).toLowerCase() === 'critical' || String(a.riskLevel).toLowerCase() === 'critical' || String(a.status).toLowerCase() === 'critical') || String(body.overallStatus).toLowerCase() === 'critical';
    if (hasCriticalRisk) {
      triggerN8nWebhook('risk-escalation', { contractId: contract._id, riskDetails: 'Critical risk flagged in compliance evaluation.' });
    }"""

replacement = """    const criticalAssessment = body.assessments?.find(a => String(a.severity).toLowerCase() === 'critical' || String(a.riskLevel).toLowerCase() === 'critical' || String(a.status).toLowerCase() === 'critical');
    const hasCriticalRisk = !!criticalAssessment || String(body.overallStatus).toLowerCase() === 'critical';
    if (hasCriticalRisk) {
      triggerN8nWebhook('risk-escalation', {
        contractId: contract._id.toString(),
        contractTitle: contract.title,
        counterparty: contract.counterparty,
        riskSeverity: 'Critical',
        riskReason: criticalAssessment?.analysis || 'Overall critical status',
        citedRule: criticalAssessment?.ruleId || 'N/A',
        citedClause: criticalAssessment?.clauseText || 'N/A'
      });
    }"""

if target in text:
    text = text.replace(target, replacement)
    with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
