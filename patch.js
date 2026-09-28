const fs = require('fs');
let code = fs.readFileSync('scratch/App.jsx', 'utf8');

// 1. Add approveContract and rejectContract functions
const functionsToAdd = `
  const approveContract = async (id) => {
    try {
      const res = await fetch(\`\${API_URL}/api/contracts/\${id}/approve\`, {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${session.token}\` }
      })
      if (res.ok) {
        fetchContracts()
        setMode('contracts')
      } else {
        const body = await res.json()
        setMessage(body.message || 'Approval failed')
      }
    } catch (err) {
      setMessage(err.message)
    }
  }

  const rejectContract = async (id) => {
    try {
      const res = await fetch(\`\${API_URL}/api/contracts/\${id}/reject\`, {
        method: 'POST',
        headers: { 'Authorization': \`Bearer \${session.token}\` }
      })
      if (res.ok) {
        fetchContracts()
        setMode('contracts')
      } else {
        const body = await res.json()
        setMessage(body.message || 'Rejection failed')
      }
    } catch (err) {
      setMessage(err.message)
    }
  }
`;

code = code.replace(/const triggerComplianceEvaluation =/, functionsToAdd + '\n  const triggerComplianceEvaluation =');

// 2. Fix the contract list view status and score
const listScoreTarget = `                                {report ? (
                                  <span
                                    className={\`tag \${
                                      report.overallStatus === 'Pass'
                                        ? 'success'
                                        : report.overallStatus === 'Warning'
                                        ? 'warning'
                                        : 'danger'
                                    }\`}
                                  >
                                    {report.overallRiskScore}/100 ({report.overallStatus})
                                  </span>
                                ) : (
                                  <span className="muted">Not Evaluated</span>
                                )}`;

const listScoreReplacement = `                                {report ? (
                                  <span
                                    className={\`tag \${
                                      report.overallStatus === 'Pass'
                                        ? 'success'
                                        : report.overallStatus === 'Warning'
                                        ? 'warning'
                                        : 'danger'
                                    }\`}
                                  >
                                    {report.overallRiskScore}/100 ({report.overallStatus})
                                  </span>
                                ) : contract.status === 'Failed' ? (
                                  <span className="muted">Evaluation Failed</span>
                                ) : (
                                  <span className="muted">Waiting for Evaluation</span>
                                )}`;

code = code.replace(listScoreTarget, listScoreReplacement);

// 3. Fix the contract detail view Risk Compliance Report
const detailReportTarget = `{complianceReport && (
                  <div className="audit-log risk-banner">
                    <h3>Risk Compliance Report (LangGraph)</h3>
                    <p>
                      Overall Score: <strong>{complianceReport.overallRiskScore} / 100</strong> — Status:{' '}
                      <strong>{complianceReport.overallStatus}</strong>
                    </p>`;

const detailReportReplacement = `                  <div className="audit-log risk-banner">
                    <h3>Risk Compliance Report</h3>
                    {!complianceReport ? (
                      <p><strong>{selectedContract.status === 'Failed' ? 'Evaluation Failed' : 'Waiting for Evaluation'}</strong></p>
                    ) : (
                      <>
                    <p>
                      Overall Score: <strong>{complianceReport.overallRiskScore}/100</strong> — Status:{' '}
                      <strong>{complianceReport.overallStatus}</strong>
                    </p>`;

code = code.replace(detailReportTarget, detailReportReplacement);

// 4. Close the <> and add the Approve/Reject buttons
const tableEndTarget = `                      </div>
                    ) : (
                      <p className="muted">No risky clauses flagged.</p>
                    )}
                  </div>
                )}`;

const tableEndReplacement = `                      </div>
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
                  </div>`;

code = code.replace(tableEndTarget, tableEndReplacement);

fs.writeFileSync('scratch/App2.jsx', code);
