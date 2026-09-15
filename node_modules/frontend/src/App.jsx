import { useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('contractiq-session') || 'null'))
  const [mode, setMode] = useState('login')
  const [contracts, setContracts] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (session) loadContracts() }, [session])

  async function loadContracts() {
    const response = await fetch(`${API_URL}/api/contracts`, { headers: { Authorization: `Bearer ${session.token}` } })
    if (response.ok) setContracts(await response.json())
  }

  async function submitAuth(event) {
    event.preventDefault(); setLoading(true); setMessage('')
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const response = await fetch(`${API_URL}/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const result = await response.json(); setLoading(false)
    if (!response.ok) return setMessage(result.message)
    localStorage.setItem('contractiq-session', JSON.stringify(result)); setSession(result)
  }

  async function uploadContract(event) {
    event.preventDefault(); setLoading(true); setMessage('')
    const response = await fetch(`${API_URL}/api/contracts`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, body: new FormData(event.currentTarget) })
    const result = await response.json(); setLoading(false)
    if (!response.ok) return setMessage(result.message)
    event.currentTarget.reset(); setMessage('Contract uploaded successfully.'); loadContracts()
  }

  if (!session) return <main className="auth-shell"><section className="brand-panel"><p className="eyebrow">CONTRACTIQ / GUARD</p><h1>Clarity for every clause.</h1><p>Keep your agreements organized, accessible, and ready for review.</p></section><section className="auth-panel"><div className="form-wrap"><p className="eyebrow">SECURE WORKSPACE</p><h2>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2><p className="muted">{mode === 'login' ? 'Sign in to continue to your contracts.' : 'Start with your name, email, and a secure password.'}</p><form onSubmit={submitAuth}>{mode === 'register' && <input name="name" placeholder="Full name" required />}<input name="email" type="email" placeholder="Email address" required /><input name="password" type="password" placeholder="Password (8+ characters)" minLength="8" required /><button disabled={loading}>{loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form>{message && <p className="error">{message}</p>}<button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage('') }}>{mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}</button></div></section></main>

  return <main className="app-shell"><header><div><p className="eyebrow">CONTRACTIQ / GUARD</p><h1>Contract workspace</h1></div><div className="header-actions"><span>{session.user.name} · {session.user.role}</span><button className="outline" onClick={() => { localStorage.removeItem('contractiq-session'); setSession(null) }}>Sign out</button></div></header><section className="content-grid"><div className="table-panel"><div className="section-heading"><div><p className="eyebrow">{contracts.length} DOCUMENTS</p><h2>All contracts</h2></div><span className="status-dot">● Live</span></div>{contracts.length ? <div className="table-wrap"><table><thead><tr><th>Title</th><th>Counterparty</th><th>Status</th><th>Uploaded</th></tr></thead><tbody>{contracts.map(contract => <tr key={contract._id}><td>{contract.title}</td><td>{contract.counterparty}</td><td><span className="tag">{contract.status}</span></td><td>{new Date(contract.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <div className="empty"><strong>Your workspace is clear.</strong><span>Upload your first contract to begin.</span></div>}</div><aside className="upload-panel"><p className="eyebrow">NEW DOCUMENT</p><h2>Upload contract</h2><p className="muted">PDF or Word documents up to 10MB.</p><form onSubmit={uploadContract}><input name="title" placeholder="Contract title" required /><input name="counterparty" placeholder="Counterparty" required /><label className="file-input"><span>Choose a file</span><input name="file" type="file" accept=".pdf,.doc,.docx" required /></label><button disabled={loading || !['Admin', 'Reviewer'].includes(session.user.role)}>{session.user.role === 'Viewer' ? 'Reviewer access required' : loading ? 'Uploading...' : 'Upload contract'}</button></form>{message && <p className={message.includes('successfully') ? 'success' : 'error'}>{message}</p>}</aside></section></main>
}

export default App
