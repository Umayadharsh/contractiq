with open("frontend/src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

# Fix the header pending button
bad_header_button = """          {session.user.role !== 'Viewer' && (
                    <button
                      className="outline"
                      disabled={evaluating || complianceReport != null}
                      onClick={() => triggerComplianceEvaluation(selectedContract._id)}
                    >
                      {evaluating ? 'Evaluating...' : selectedContract.status === 'Failed' ? 'Evaluation Failed — Retry' : 'Evaluate'}
                    </button>
          )}
          <span>"""

good_header_button = """          {session.user.role !== 'Viewer' && (
            <button className={`outline ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
              ⏳ Pending Approval ({pendingActions.length})
            </button>
          )}
          <span>"""

if bad_header_button in text:
    text = text.replace(bad_header_button, good_header_button)
    print("Fixed header button")

# Fix the detail-panel evaluate button to be Reviewer only
old_eval_button = """                  {session.user.role !== 'Viewer' && (
                    <button
                      className="outline"
                      disabled={evaluating || complianceReport != null}
                      onClick={() => triggerComplianceEvaluation(selectedContract._id)}
                    >
                      {evaluating ? 'Evaluating...' : selectedContract.status === 'Failed' ? 'Evaluation Failed — Retry' : 'Evaluate'}
                    </button>
                  )}"""

new_eval_button = """                  {session.user.role === 'Reviewer' && (
                    <button
                      className="outline"
                      disabled={evaluating || complianceReport != null}
                      onClick={() => triggerComplianceEvaluation(selectedContract._id)}
                    >
                      {evaluating ? 'Evaluating...' : selectedContract.status === 'Failed' ? 'Evaluation Failed — Retry' : 'Evaluate'}
                    </button>
                  )}"""

if old_eval_button in text:
    text = text.replace(old_eval_button, new_eval_button)
    print("Fixed evaluate button role")

with open("frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)
