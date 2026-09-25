const fs = require("fs");
let code = fs.readFileSync("frontend/src/App.jsx", "utf8");

code = code.replace(
    "<th>Contract</th><th>Action</th><th>Policy</th><th>Reason</th><th>Risk</th><th>Decision</th>",
    "<th>Contract</th><th>Action</th><th>Proposed by</th><th>Status</th><th>Approver</th><th>Decision</th>"
);

const oldRow = /{pendingActions\.map\(\(action\) => <tr key=\{action\._id\}>.*?<\/tr>\)\}/s;
const newRow = `{pendingActions.map((action) => {
              const isProposer = String(action.proposal?.proposedBy) === String(session.user.id);
              const allowedRoles = action.policySnapshot?.approval?.approverRoles || [];
              const isAuthorized = allowedRoles.includes(session.user.role);
              const canDecide = isAuthorized && !isProposer;
              return (
                <tr key={action._id}>
                  <td>{action.contractId?.title || action.contractId}</td>
                  <td>{action.type}</td>
                  <td>{action.proposal?.proposedBy || 'Unknown'}</td>
                  <td>{action.status}</td>
                  <td>{allowedRoles.join(', ') || 'None'}</td>
                  <td>
                    {canDecide ? (
                      <>
                        <button className="text-button" onClick={() => decideAgentAction(action._id, 'approve')}>Approve</button>
                        <button className="text-button danger" onClick={() => decideAgentAction(action._id, 'reject')}>Reject</button>
                      </>
                    ) : (
                      <span className="muted" style={{fontSize:'12px'}}>
                        {isProposer ? 'You cannot approve or reject your own action.' : 'You are not authorized to approve or reject this action.'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}`;

code = code.replace(oldRow, newRow);

fs.writeFileSync("frontend/src/App.jsx", code, "utf8");
