
const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/agentGuard.js', 'utf8');

code = code.replace(
  'const { policyId, name, description, priority, trigger, decision, action, approval, version } = req.body;',
  'if (req.body.approval && Array.isArray(req.body.approval.approverRoles)) {\n        req.body.approval.approverRoles = req.body.approval.approverRoles.filter(role => role !== \\'Viewer\\');\n      }\n      const { policyId, name, description, priority, trigger, decision, action, approval, version } = req.body;'
);

code = code.replace(
  'const fields = [\\'name\\', \\'description\\', \\'priority\\', \\'trigger\\', \\'decision\\', \\'action\\', \\'approval\\', \\'isActive\\'];',
  'if (req.body.approval && Array.isArray(req.body.approval.approverRoles)) {\n        req.body.approval.approverRoles = req.body.approval.approverRoles.filter(role => role !== \\'Viewer\\');\n      }\n      const fields = [\\'name\\', \\'description\\', \\'priority\\', \\'trigger\\', \\'decision\\', \\'action\\', \\'approval\\', \\'isActive\\'];'
);

fs.writeFileSync('backend/src/routes/agentGuard.js', code, 'utf8');

