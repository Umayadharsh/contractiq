const fs = require('fs');
let code = fs.readFileSync('frontend/src/App.jsx', 'utf8');

// Replace the approveContract and rejectContract definitions with empty since we use decideAgentAction
code = code.replace(/const approveContract = async .*?};/s, '');
code = code.replace(/const rejectContract = async .*?};/s, '');

const buttonsRegex = /<button\s*className="text-button"\s*disabled=\{!complianceReport \|\| evaluating \|\| selectedContract\.status === 'Approved' \|\| selectedContract\.status === 'Rejected'\}\s*onClick=\{\(\) => approveContract\(selectedContract\._id\)\}\s*>\s*Approve\s*<\/button>\s*<button\s*className="text-button danger"\s*disabled=\{!complianceReport \|\| evaluating \|\| selectedContract\.status === 'Approved' \|\| selectedContract\.status === 'Rejected'\}\s*onClick=\{\(\) => rejectContract\(selectedContract\._id\)\}\s*>\s*Reject\s*<\/button>/s;

const newButtons = `<button 
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
                      </button>`;

code = code.replace(buttonsRegex, newButtons);

// Make sure to remove the rogue approve/reject routes in contracts.js if they are there, wait, I already removed them or didn't I?
// I added them via powershell `Add-Content`. I must remove them!

fs.writeFileSync('frontend/src/App.jsx', code);
