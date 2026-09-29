with open("frontend/src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

target = """                  {session.user.role !== 'Viewer' && (
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
                  )}"""

replacement = """                  {session.user.role !== 'Viewer' && complianceReport?.agentGuard?.actionStatus === 'pending_approval' && (
                    (() => {
                      const proposerId = complianceReport.proposedActions?.[0]?.proposal?.proposedBy;
                      const isProposer = proposerId && String(proposerId) === String(session.user.id);
                      const isAuthorized = complianceReport.agentGuard?.allowedApproverRoles?.includes(session.user.role);
                      const canDecide = isAuthorized && !isProposer && selectedContract.status !== 'Approved' && selectedContract.status !== 'Rejected' && !evaluating;
                      
                      return (
                        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                              className="text-button" 
                              disabled={!canDecide}
                              onClick={() => decideAgentAction(complianceReport.agentGuard.actionId, 'approve')}
                            >
                              Approve
                            </button>
                            <button 
                              className="text-button danger" 
                              disabled={!canDecide}
                              onClick={() => decideAgentAction(complianceReport.agentGuard.actionId, 'reject')}
                            >
                              Reject
                            </button>
                          </div>
                          {!canDecide && (
                            <span className="muted" style={{fontSize:'12px'}}>
                              {isProposer ? 'You cannot approve or reject your own action.' : 'You are not authorized to approve or reject this action.'}
                            </span>
                          )}
                        </div>
                      );
                    })()
                  )}"""

if target in text:
    text = text.replace(target, replacement)
    with open("frontend/src/App.jsx", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
