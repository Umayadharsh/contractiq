const fs = require("fs");
let code = fs.readFileSync("frontend/src/App.jsx", "utf8");
code = code.replace(/approverRoles: 'Reviewer, Admin'/g, "approverRoles: 'Reviewer'");
fs.writeFileSync("frontend/src/App.jsx", code, "utf8");
