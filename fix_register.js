
const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/auth.js', 'utf8');

code = code.replace(
  'const isFirstUser = !(await User.exists({}));\n    const requestedRole = req.body.selectedRole || \'Viewer\';\n    const role = isFirstUser ? \'Admin\' : ([\'Viewer\', \'Reviewer\', \'Admin\'].includes(requestedRole) ? requestedRole : \'Viewer\');',
  'const isFirstUser = !(await User.exists({}));\n    const requestedRole = req.body.selectedRole || \'Viewer\';\n    const role = isFirstUser ? \'Admin\' : ([\'Viewer\', \'Reviewer\'].includes(requestedRole) ? requestedRole : \'Viewer\');'
);

fs.writeFileSync('backend/src/routes/auth.js', code, 'utf8');

