const fs = require('fs');
let code = fs.readFileSync('frontend/src/App.jsx', 'utf8');

const funcs = `
  const approveContract = async (id) => {
    try {
      const res = await fetch(\`\${API_URL}/api/contracts/\${id}/approve\`, {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${session.token}\` }
      });
      if (res.ok) {
        fetchContracts();
        selectContract(id); // Reload the detail panel
      } else {
        const body = await res.json();
        setMessage(body.message || 'Approval failed');
      }
    } catch (err) {
      setMessage(err.message);
    }
  };

  const rejectContract = async (id) => {
    try {
      const res = await fetch(\`\${API_URL}/api/contracts/\${id}/reject\`, {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${session.token}\` }
      });
      if (res.ok) {
        fetchContracts();
        selectContract(id); // Reload the detail panel
      } else {
        const body = await res.json();
        setMessage(body.message || 'Rejection failed');
      }
    } catch (err) {
      setMessage(err.message);
    }
  };

  async function triggerComplianceEvaluation`;

code = code.replace(/async function triggerComplianceEvaluation/, funcs);

fs.writeFileSync('frontend/src/App.jsx', code);
