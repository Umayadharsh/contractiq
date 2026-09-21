import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function formatReviewState(field) {
  if (!field) return null
  if (typeof field === 'object' && 'needsReview' in field && 'confidence' in field) {
    return {
      value: field.value ?? field.text ?? null,
      confidence: field.confidence || 'low',
      needsReview: Boolean(field.needsReview),
      sourceSpan: field.sourceSpan || null,
    }
  }
  return { value: field, confidence: 'high', needsReview: false, sourceSpan: null }
}

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('contractiq-session') || 'null'))
  const [mode, setMode] = useState('login')
  const [activeTab, setActiveTab] = useState('contracts') // 'contracts' | 'playbook'
  const [contracts, setContracts] = useState([])
  const [playbookRules, setPlaybookRules] = useState([])
  const [selectedContractId, setSelectedContractId] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState(null)

  // Playbook Form State
  const [ruleForm, setRuleForm] = useState({
    ruleId: '',
    title: '',
    category: 'liability',
    description: '',
    expectedRequirement: '',
    severity: 'Major',
    fallbackText: '',
    isActive: true,
  })

  useEffect(() => {
    if (session) {
      loadContracts()
      loadPlaybookRules()
    }
  }, [session])

  useEffect(() => {
    if (!contracts.length) return setSelectedContractId(null)
    if (!selectedContractId || !contracts.some((contract) => contract._id === selectedContractId)) {
      setSelectedContractId(contracts[0]._id)
    }
  }, [contracts, selectedContractId])

  async function loadContracts() {
    const response = await fetch(`${API_URL}/api/contracts`, { headers: { Authorization: `Bearer ${session.token}` } })
    if (response.ok) setContracts(await response.json())
  }

  async function loadPlaybookRules() {
    const response = await fetch(`${API_URL}/api/playbooks?all=true`, { headers: { Authorization: `Bearer ${session.token}` } })
    if (response.ok) setPlaybookRules(await response.json())
  }

  async function submitAuth(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const response = await fetch(`${API_URL}/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const result = await response.json()
    setLoading(false)
    if (!response.ok) return setMessage(result.message)
    localStorage.setItem('contractiq-session', JSON.stringify(result))
    setSession(result)
  }

  async function uploadContract(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const response = await fetch(`${API_URL}/api/contracts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
      body: new FormData(event.currentTarget),
    })
    const result = await response.json()
    setLoading(false)
    if (!response.ok) return setMessage(result.message)
    event.currentTarget.reset()
    setMessage('Contract uploaded successfully.')
    loadContracts()
  }

  function resetRuleForm() {
    setEditingRuleId(null)
    setRuleForm({
      ruleId: '',
      title: '',
      category: 'liability',
      description: '',
      expectedRequirement: '',
      severity: 'Major',
      fallbackText: '',
      isActive: true,
    })
  }

  function startEditingRule(rule) {
    setEditingRuleId(rule._id)
    setRuleForm({
      ruleId: rule.ruleId,
      title: rule.title,
      category: rule.category,
      description: rule.description,
      expectedRequirement: rule.expectedRequirement,
      severity: rule.severity,
      fallbackText: rule.fallbackText || '',
      isActive: Boolean(rule.isActive),
    })
  }

  async function savePlaybookRule(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const url = editingRuleId ? `${API_URL}/api/playbooks/${editingRuleId}` : `${API_URL}/api/playbooks`
    const method = editingRuleId ? 'PUT' : 'POST'

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ruleForm),
    })
    const result = await response.json()
    setLoading(false)
    if (!response.ok) return setMessage(result.message || 'Failed to save playbook rule')
    setMessage(`Playbook rule ${result.ruleId} ${editingRuleId ? 'updated' : 'created'} successfully.`)
    resetRuleForm()
    loadPlaybookRules()
  }

  async function deletePlaybookRule(ruleId) {
    if (!confirm('Are you sure you want to delete this rule?')) return
    const response = await fetch(`${API_URL}/api/playbooks/${ruleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.token}` },
    })
    if (response.ok) {
      setMessage('Playbook rule deleted.')
      loadPlaybookRules()
    }
  }

  async function triggerComplianceEvaluation(contractId) {
    setEvaluating(true)
    setMessage('')
    const response = await fetch(`${API_URL}/api/contracts/${contractId}/evaluate-compliance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
    })
    const result = await response.json()
    setEvaluating(false)
    if (!response.ok) return setMessage(result.message || 'Compliance evaluation failed.')
    setMessage('Risk compliance evaluation complete.')
    loadContracts()
  }

  function selectContract(contractId) {
    setSelectedContractId(contractId)
    setTimeout(() => {
      const panel = document.getElementById('contract-detail-panel')
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 50)
  }

  const selectedContract = useMemo(
    () => contracts.find((contract) => contract._id === selectedContractId) || null,
    [contracts, selectedContractId]
  )

  const extractedFields = selectedContract?.extractedFields || {}
  const complianceReport = selectedContract?.complianceReport || null

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="brand-panel">
          <p className="eyebrow">CONTRACTIQ / GUARD</p>
          <h1>Clarity for every clause.</h1>
          <p>Keep your agreements organized, accessible, and ready for review.</p>
        </section>
        <section className="auth-panel">
          <div className="form-wrap">
            <p className="eyebrow">SECURE WORKSPACE</p>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>
            <p className="muted">
              {mode === 'login' ? 'Sign in to continue to your contracts.' : 'Start with your name, email, and a secure password.'}
            </p>
            <form onSubmit={submitAuth}>
              {mode === 'register' && <input name="name" placeholder="Full name" required />}
              <input name="email" type="email" placeholder="Email address" required />
              <input name="password" type="password" placeholder="Password (8+ characters)" minLength="8" required />
              <button disabled={loading}>{loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
            </form>
            {message && <p className="error">{message}</p>}
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setMessage('')
              }}
            >
              {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">CONTRACTIQ / GUARD</p>
          <h1>Contract & Risk Compliance Workspace</h1>
        </div>
        <div className="header-actions">
          <button className={`outline ${activeTab === 'contracts' ? 'active' : ''}`} onClick={() => setActiveTab('contracts')}>
            📄 Contracts
          </button>
          {session.user.role === 'Admin' && (
            <button className={`outline ${activeTab === 'playbook' ? 'active' : ''}`} onClick={() => setActiveTab('playbook')}>
              🛡️ Company Playbook (Admin)
            </button>
          )}
          <span>
            {session.user.name} · <strong>{session.user.role}</strong>
          </span>
          <button
            className="outline"
            onClick={() => {
              localStorage.removeItem('contractiq-session')
              setSession(null)
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* --- PLAYBOOK ADMIN TAB --- */}
      {activeTab === 'playbook' && session.user.role === 'Admin' ? (
        <section className="content-grid">
          <div className="table-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{playbookRules.length} ACTIVE & INACTIVE RULES</p>
                <h2>Company Compliance Playbook</h2>
              </div>
              <span className="status-dot">● Admin Mode</span>
            </div>
            {playbookRules.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Rule ID</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Severity</th>
                      <th>Requirement</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playbookRules.map((rule) => (
                      <tr key={rule._id}>
                        <td>
                          <strong>{rule.ruleId}</strong>
                        </td>
                        <td>{rule.title}</td>
                        <td>
                          <span className="tag">{rule.category}</span>
                        </td>
                        <td>
                          <span
                            className={`tag ${
                              rule.severity === 'Critical' ? 'warning' : rule.severity === 'Major' ? '' : 'muted'
                            }`}
                          >
                            {rule.severity}
                          </span>
                        </td>
                        <td>{rule.expectedRequirement}</td>
                        <td>
                          <span className={`status-dot ${rule.isActive ? '' : 'inactive'}`}>
                            {rule.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <button className="text-button" onClick={() => startEditingRule(rule)}>
                            Edit
                          </button>
                          <button className="text-button danger" onClick={() => deletePlaybookRule(rule._id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <strong>No playbook rules defined.</strong>
                <span>Add your first compliance rule below.</span>
              </div>
            )}
          </div>

          <aside className="upload-panel">
            <p className="eyebrow">{editingRuleId ? 'EDIT RULE' : 'NEW COMPLIANCE RULE'}</p>
            <h2>{editingRuleId ? 'Edit Playbook Rule' : 'Add Playbook Rule'}</h2>
            <p className="muted">Define company contract benchmarks and risk severity.</p>
            <form onSubmit={savePlaybookRule}>
              <input
                placeholder="Rule ID (e.g. RULE-LIAB-01)"
                value={ruleForm.ruleId}
                onChange={(e) => setRuleForm({ ...ruleForm, ruleId: e.target.value })}
                required
                disabled={Boolean(editingRuleId)}
              />
              <input
                placeholder="Title (e.g. Liability Cap)"
                value={ruleForm.title}
                onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })}
                required
              />
              <select
                value={ruleForm.category}
                onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                required
              >
                <option value="liability">liability</option>
                <option value="payment">payment</option>
                <option value="termination">termination</option>
                <option value="indemnity">indemnity</option>
                <option value="confidentiality">confidentiality</option>
                <option value="governing_law">governing_law</option>
                <option value="other">other</option>
              </select>
              <textarea
                placeholder="Rule Description"
                value={ruleForm.description}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                required
              />
              <textarea
                placeholder="Expected Requirement (e.g. Max 1x ACV)"
                value={ruleForm.expectedRequirement}
                onChange={(e) => setRuleForm({ ...ruleForm, expectedRequirement: e.target.value })}
                required
              />
              <select value={ruleForm.severity} onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value })}>
                <option value="Critical">Critical (-30 pts)</option>
                <option value="Major">Major (-15 pts)</option>
                <option value="Minor">Minor (-5 pts)</option>
              </select>
              <textarea
                placeholder="Fallback Remediation Clause Text (Optional)"
                value={ruleForm.fallbackText}
                onChange={(e) => setRuleForm({ ...ruleForm, fallbackText: e.target.value })}
              />
              <button disabled={loading}>{loading ? 'Saving...' : editingRuleId ? 'Update Rule' : 'Add Rule'}</button>
              {editingRuleId && (
                <button type="button" className="outline" onClick={resetRuleForm} style={{ marginTop: '8px' }}>
                  Cancel Edit
                </button>
              )}
            </form>
            {message && <p className={message.includes('successfully') ? 'success' : 'error'}>{message}</p>}
          </aside>
        </section>
      ) : (
        /* --- CONTRACTS WORKSPACE TAB --- */
        <>
          <section className="content-grid">
            <div className="table-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{contracts.length} DOCUMENTS</p>
                  <h2>All contracts</h2>
                </div>
                <span className="status-dot">● Live</span>
              </div>
              {contracts.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Counterparty</th>
                        <th>Status</th>
                        <th>Risk Score</th>
                        <th>Uploaded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map((contract) => {
                        const report = contract.complianceReport
                        return (
                          <tr
                            key={contract._id}
                            className={`contract-row ${selectedContractId === contract._id ? 'selected-row' : ''}`}
                            onClick={() => selectContract(contract._id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                selectContract(contract._id)
                              }
                            }}
                          >
                            <td>{contract.title}</td>
                            <td>{contract.counterparty}</td>
                            <td>
                              <span className={`tag ${contract.status === 'NeedsReview' ? 'warning' : ''}`}>
                                {contract.status}
                              </span>
                            </td>
                            <td>
                              {report ? (
                                <span
                                  className={`tag ${
                                    report.overallStatus === 'Pass'
                                      ? 'success'
                                      : report.overallStatus === 'Warning'
                                      ? 'warning'
                                      : 'danger'
                                  }`}
                                >
                                  {report.overallRiskScore}/100 ({report.overallStatus})
                                </span>
                              ) : (
                                <span className="muted">Not Evaluated</span>
                              )}
                            </td>
                            <td>{new Date(contract.createdAt).toLocaleDateString()}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">
                  <strong>Your workspace is clear.</strong>
                  <span>Upload your first contract to begin.</span>
                </div>
              )}
            </div>

            <aside className="upload-panel">
              <p className="eyebrow">NEW DOCUMENT</p>
              <h2>Upload contract</h2>
              <p className="muted">PDF or Word documents up to 10MB.</p>
              <form onSubmit={uploadContract}>
                <input name="title" placeholder="Contract title" required />
                <input name="counterparty" placeholder="Counterparty" required />
                <label className="file-input">
                  <span>Choose a file</span>
                  <input name="file" type="file" accept=".pdf,.doc,.docx" required />
                </label>
                <button disabled={loading || !['Admin', 'Reviewer'].includes(session.user.role)}>
                  {session.user.role === 'Viewer' ? 'Reviewer access required' : loading ? 'Uploading...' : 'Upload contract'}
                </button>
              </form>
              {message && <p className={message.includes('successfully') ? 'success' : 'error'}>{message}</p>}
            </aside>
          </section>

          {selectedContract && (
            <section className="detail-panel" id="contract-detail-panel">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">CONTRACT DETAILS & RISK ASSESSMENT</p>
                  <h2>{selectedContract.title}</h2>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {selectedContract.fileUrl && (
                    <a
                      href={`${API_URL}${selectedContract.fileUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="outline"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      📄 View Original Document
                    </a>
                  )}
                  <button
                    className="outline"
                    disabled={evaluating}
                    onClick={() => triggerComplianceEvaluation(selectedContract._id)}
                  >
                    {evaluating ? 'Evaluating LangGraph...' : '🛡️ Evaluate Playbook Risk'}
                  </button>
                </div>
              </div>

              {complianceReport && (
                <div className="audit-log risk-banner">
                  <h3>Risk Compliance Report (LangGraph)</h3>
                  <p>
                    Overall Score: <strong>{complianceReport.overallRiskScore} / 100</strong> — Status:{' '}
                    <strong>{complianceReport.overallStatus}</strong>
                  </p>
                  {complianceReport.assessments?.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Clause ID</th>
                            <th>Risk Flag</th>
                            <th>Severity</th>
                            <th>Cited Rule ID</th>
                            <th>Cited Text Snippet</th>
                            <th>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {complianceReport.assessments.map((ass, i) => (
                            <tr key={i}>
                              <td>{ass.clauseId}</td>
                              <td>
                                <span className={`tag ${ass.riskFlag === 'Non-Compliant' ? 'danger' : 'warning'}`}>
                                  {ass.riskFlag}
                                </span>
                              </td>
                              <td>{ass.severity}</td>
                              <td>
                                <strong>{ass.citedRuleId}</strong>
                              </td>
                              <td>
                                <em>"{ass.citedClauseText}"</em>
                              </td>
                              <td>{ass.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="success-text">✅ No playbook rule violations detected.</p>
                  )}
                </div>
              )}

              {extractedFields && Object.keys(extractedFields).length > 0 && (
                <div className="extraction-grid">
                  <div className="field-card">
                    <h3>Parties</h3>
                    {Array.isArray(extractedFields.parties) && extractedFields.parties.length ? (
                      extractedFields.parties.map((party, index) => {
                        const meta = formatReviewState(party)
                        return (
                          <div className="meta-row" key={`${party?.value || 'party'}-${index}`}>
                            <span>{meta.value}</span>
                            {meta.needsReview && <span className="mini-badge">Review</span>}
                            {meta.confidence && <span className="confidence-pill">{meta.confidence}</span>}
                          </div>
                        )
                      })
                    ) : (
                      <p className="muted">No parties extracted</p>
                    )}
                  </div>

                  <div className="field-card">
                    <h3>Core values</h3>
                    {['contractValue', 'startDate', 'endDate', 'governingLaw', 'paymentTerms', 'liabilityLimit'].map((key) => {
                      const field = extractedFields[key]
                      if (!field) return null
                      const meta = formatReviewState(field)
                      return (
                        <div className="meta-row" key={key}>
                          <span className="field-label">{key}</span>
                          <span>{meta.value ?? '—'}</span>
                          {meta.needsReview && <span className="mini-badge">Review</span>}
                          {meta.confidence && <span className="confidence-pill">{meta.confidence}</span>}
                        </div>
                      )
                    })}
                  </div>

                  <div className="field-card clauses-card">
                    <h3>Clauses</h3>
                    {Array.isArray(extractedFields.clauses) && extractedFields.clauses.length ? (
                      extractedFields.clauses.map((clause, index) => {
                        const meta = formatReviewState(clause)
                        return (
                          <div className="clause-item" key={`${clause.type || 'clause'}-${index}`}>
                            <div className="clause-header">
                              <strong>{clause.type}</strong>
                              {meta.needsReview && <span className="mini-badge">Review</span>}
                              {meta.confidence && <span className="confidence-pill">{meta.confidence}</span>}
                            </div>
                            <p>{clause.text}</p>
                            {clause.summary && <small>{clause.summary}</small>}
                          </div>
                        )
                      })
                    ) : (
                      <p className="muted">No clauses extracted</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}

export default App
