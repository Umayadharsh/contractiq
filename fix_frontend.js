
const fs = require('fs');
let code = fs.readFileSync('frontend/src/App.jsx', 'utf8');

code = code.replace(
  'if (data.selectedRole) {\n      result.user.displayRole = data.selectedRole;\n    }',
  ''
);

code = code.replace(
  '<strong>{session.user.displayRole || session.user.role}</strong>',
  '<strong>{session.user.role}</strong>'
);

fs.writeFileSync('frontend/src/App.jsx', code, 'utf8');

