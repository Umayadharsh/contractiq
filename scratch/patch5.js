const fs = require('fs');
let code = fs.readFileSync('frontend/src/App.jsx', 'utf8');

// Target 1:
// {complianceReport && (
//   <div className="audit-log risk-banner">
//     <h3>Risk Compliance Report</h3>
//     {!complianceReport ? (

const t1 = /\{complianceReport && \(\s*<div className="audit-log risk-banner">/g;
code = code.replace(t1, '<div className="audit-log risk-banner">');

// Target 2:
//   ) : (
//     <p className="success-text">✅ No playbook rule violations detected.</p>
//   )}
// </div>
// )}

const t2 = /<p className="success-text">✅ No playbook rule violations detected\.<\/p>\s*\)\}\s*<\/div>\s*\)\}/g;
const replacement2 = `<p className="success-text">✅ No playbook rule violations detected.</p>
                  )}
                  
                  {session.user.role !== 'Viewer' && (
                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                      <button 
                        className="text-button" 
                        disabled={!complianceReport?.agentGuard?.actionId || complianceReport.agentGuard.actionStatus !== 'pending_approval' || evaluating || selectedContract.status === 'Approved' || selectedContract.status === 'Rejected' || !complianceReport.agentGuard?.allowedApproverRoles?.includes(session.user.role)}
                        onClick={() => decideAgentAction(complianceReport.agentGuard.actionId, 'approve')}
                      >
                        Approve
                      </button>
                      <button 
                        className="text-button danger" 
                        disabled={!complianceReport?.agentGuard?.actionId || complianceReport.agentGuard.actionStatus !== 'pending_approval' || evaluating || selectedContract.status === 'Approved' || selectedContract.status === 'Rejected' || !complianceReport.agentGuard?.allowedApproverRoles?.includes(session.user.role)}
                        onClick={() => decideAgentAction(complianceReport.agentGuard.actionId, 'reject')}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  </>
                )}
              </div>`;

code = code.replace(t2, replacement2);

fs.writeFileSync('frontend/src/App.jsx', code);
