const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/contracts.js', 'utf8');

code = code.replace(
  "evaluationRunId: body.evaluationRunId",
  "evaluationRunId: body.evaluationRunId,\n        agentGuard: body.agentGuard"
);

code = code.replace(
  "contract.status = 'Reviewed';",
  `if (body.agentGuard?.actionStatus === 'pending_approval') {
        contract.status = 'Waiting for Approval';
      } else {
        contract.status = 'Reviewed';
      }`
);

fs.writeFileSync('backend/src/routes/contracts.js', code);
