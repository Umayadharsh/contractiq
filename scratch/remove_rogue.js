const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/contracts.js', 'utf8');

const rogueApprove = /router\.post\('\/:id\/approve', allowRoles.*?\}\s*\n\}\);\s*/s;
const rogueReject = /router\.post\('\/:id\/reject', allowRoles.*?\}\s*\n\}\);\s*/s;

code = code.replace(rogueApprove, '');
code = code.replace(rogueReject, '');

fs.writeFileSync('backend/src/routes/contracts.js', code);
