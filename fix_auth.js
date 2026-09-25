
const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/auth.js', 'utf8');

code = code.replace(
  'if (!user || !(await bcrypt.compare(req.body.password || \'\', user.password))) return res.status(401).json({ message: \'Invalid email or password\' });',
  'if (!user || !(await bcrypt.compare(req.body.password || \'\', user.password))) return res.status(401).json({ message: \'Invalid email or password\' });\n    if (req.body.selectedRole && req.body.selectedRole !== user.role) return res.status(403).json({ message: \'Invalid role selected for this account.\' });'
);

code = code.replace(
  'const role = await User.exists({}) ? \'Viewer\' : \'Admin\';',
  'const isFirstUser = !(await User.exists({}));\n    const requestedRole = req.body.selectedRole || \'Viewer\';\n    const role = isFirstUser ? \'Admin\' : ([\'Viewer\', \'Reviewer\', \'Admin\'].includes(requestedRole) ? requestedRole : \'Viewer\');'
);

fs.writeFileSync('backend/src/routes/auth.js', code, 'utf8');

