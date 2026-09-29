with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

target1 = """    const clauses = await Clause.find({ contractId: contract._id });
    const evaluationRunId = randomUUID();"""

replacement1 = """    const clauses = await Clause.find({ contractId: contract._id });
    const evaluationRunId = randomUUID();
    console.log('Evaluation started');"""

target2 = """    await contract.save();

    triggerN8nWebhook('new-upload', {"""

replacement2 = """    await contract.save();
    console.log('Evaluation completed');
    console.log(`Risk score: ${body.overallRiskScore}`);
    console.log(`Status: ${body.overallStatus}`);
    if (body.agentGuard) console.log('AgentGuard action created');

    console.log('n8n webhook triggered');
    triggerN8nWebhook('new-upload', {"""

if target1 in text and target2 in text:
    text = text.replace(target1, replacement1)
    text = text.replace(target2, replacement2)
    with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
