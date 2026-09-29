import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function AuditLogs({ session }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [actor, setActor] = useState('');
  const [actionType, setActionType] = useState('');
  const [decision, setDecision] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [page, actor, actionType, decision, startDate, endDate, search, session]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      if (actor) params.append('actor', actor);
      if (actionType) params.append('actionType', actionType);
      if (decision) params.append('decision', decision);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (search) params.append('search', search);

      const res = await fetch(`${API_URL}/api/audit-logs?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${session.token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
    }
    setLoading(false);
  }

  return (
    <section className="content-grid">
      <div className="table-panel" style={{ width: '100%' }}>
        <div className="section-heading">
          <div><p className="eyebrow">SYSTEM AUDIT</p><h2>Audit Logs</h2></div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div><label>Search</label><br/><input type="text" value={search} onChange={e => {setSearch(e.target.value); setPage(1)}} /></div>
          <div><label>Actor</label><br/><input type="text" value={actor} onChange={e => {setActor(e.target.value); setPage(1)}} /></div>
          <div>
            <label>Action Type</label><br/>
            <select value={actionType} onChange={e => {setActionType(e.target.value); setPage(1)}}>
              <option value="">All</option>
              <option value="login">Login</option>
              <option value="register">Register</option>
              <option value="upload_contract">Upload Contract</option>
              <option value="create_playbook_rule">Create Playbook</option>
              <option value="edit_playbook_rule">Edit Playbook</option>
              <option value="delete_playbook_rule">Delete Playbook</option>
              <option value="create_policy">Create Policy</option>
              <option value="edit_policy">Edit Policy</option>
              <option value="delete_policy">Delete Policy</option>
              <option value="agent_decision">Agent Decision</option>
              <option value="human_approve">Human Approve</option>
              <option value="human_reject">Human Reject</option>
              <option value="n8n_trigger">n8n Webhook</option>
            </select>
          </div>
          <div>
            <label>Decision</label><br/>
            <select value={decision} onChange={e => {setDecision(e.target.value); setPage(1)}}>
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="auto_approve">Auto Approve</option>
              <option value="escalate">Escalate</option>
              <option value="policy_deny">Policy Deny</option>
              <option value="default_deny">Default Deny</option>
              <option value="approved">Approved (Human)</option>
              <option value="rejected">Rejected (Human)</option>
            </select>
          </div>
          <div><label>Start Date</label><br/><input type="date" value={startDate} onChange={e => {setStartDate(e.target.value); setPage(1)}} /></div>
          <div><label>End Date</label><br/><input type="date" value={endDate} onChange={e => {setEndDate(e.target.value); setPage(1)}} /></div>
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="empty">Loading...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Decision</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log._id}>
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                    <td>{log.actorEmail || log.actor}</td>
                    <td>{log.actionType}</td>
                    <td>{log.decision}</td>
                    <td>{JSON.stringify(log.details)}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty">No logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <span>Page {page} of {totalPages} (Total: {total})</span>
          <div>
            <button className="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
            <button className="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ marginLeft: '8px' }}>Next</button>
          </div>
        </div>
      </div>
    </section>
  );
}
