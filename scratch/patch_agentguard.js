const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/agentGuard.js', 'utf8');

if (!code.includes("import Contract from '../models/Contract.js';")) {
  code = code.replace("import AgentAction from '../models/AgentAction.js';", "import AgentAction from '../models/AgentAction.js';\nimport Contract from '../models/Contract.js';");
}

code = code.replace(
  "const executed = await executeAgentAction(approvedAction);",
  "const executed = await executeAgentAction(approvedAction);\n      await Contract.updateOne({ _id: action.contractId }, { $set: { status: 'Approved' } });"
);

code = code.replace(
  "const rejectedAction = await AgentAction.findOne({ _id: action._id });",
  "const rejectedAction = await AgentAction.findOne({ _id: action._id });\n      await Contract.updateOne({ _id: action.contractId }, { $set: { status: 'Rejected' } });"
);

fs.writeFileSync('backend/src/routes/agentGuard.js', code);
