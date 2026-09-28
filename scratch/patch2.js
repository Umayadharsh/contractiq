const fs = require('fs');
let code = fs.readFileSync('frontend/src/App.jsx', 'utf8');

code = code.replace(
  /\) : \(\s*<span className="muted">Not Evaluated<\/span>\s*\)/,
  `) : contract.status === 'Failed' ? (
                                <span className="muted">Evaluation Failed</span>
                              ) : (
                                <span className="muted">Waiting for Evaluation</span>
                              )`
);

const detailReportTarget = /<div className="audit-log risk-banner">\s*<h3>Risk Compliance Report \(LangGraph\)<\/h3>\s*<p>\s*Overall Score:/;
code = code.replace(detailReportTarget, `<div className="audit-log risk-banner">
                  <h3>Risk Compliance Report</h3>
                  {!complianceReport ? (
                    <p><strong>{selectedContract.status === 'Failed' ? 'Evaluation Failed' : 'Waiting for Evaluation'}</strong></p>
                  ) : (
                    <>
                  <p>
                    Overall Score:`);

const tableEndTarget = /<\/div>\s*\) : \(\s*<p className="muted">No risky clauses flagged\.<\/p>\s*\)\}\s*<\/div>\s*\)\}/;
code = code.replace(tableEndTarget, `</div>
                  ) : (
                    <p className="muted">No risky clauses flagged.</p>
                  )}
                  </>
                  )}
                  
                  {session.user.role !== 'Viewer' && (
                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                      <button 
                        className="text-button" 
                        disabled={!complianceReport || evaluating || selectedContract.status === 'Approved' || selectedContract.status === 'Rejected'}
                        onClick={() => approveContract(selectedContract._id)}
                      >
                        Approve
                      </button>
                      <button 
                        className="text-button danger" 
                        disabled={!complianceReport || evaluating || selectedContract.status === 'Approved' || selectedContract.status === 'Rejected'}
                        onClick={() => rejectContract(selectedContract._id)}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}`);

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

  const triggerComplianceEvaluation`;

code = code.replace(/const triggerComplianceEvaluation/, funcs);

fs.writeFileSync('frontend/src/App.jsx', code);
