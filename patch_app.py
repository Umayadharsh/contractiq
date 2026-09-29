import os
import re

with open('frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

if "import AuditLogs from './pages/AuditLogs'" not in text:
    text = text.replace("import './App.css'", "import './App.css'\nimport AuditLogs from './pages/AuditLogs'")

# Add button for Audit Logs
tab_btn_target = """            {session.user.role === 'Admin' && (
              <button className={`outline ${activeTab === 'agentguard' ? 'active' : ''}`} onClick={() => setActiveTab('agentguard')}>"""

tab_btn_repl = """            {session.user.role === 'Admin' && (
              <button className={`outline ${activeTab === 'auditlogs' ? 'active' : ''}`} onClick={() => setActiveTab('auditlogs')}>
                📋 Audit Logs
              </button>
            )}
            {session.user.role === 'Admin' && (
              <button className={`outline ${activeTab === 'agentguard' ? 'active' : ''}`} onClick={() => setActiveTab('agentguard')}>"""

if "📋 Audit Logs" not in text:
    text = text.replace(tab_btn_target, tab_btn_repl)

# Render component
render_target = """        {/* --- PLAYBOOK ADMIN TAB --- */}
        {activeTab === 'agentguard' && session.user.role === 'Admin' ? ("""

render_repl = """        {/* --- PLAYBOOK ADMIN TAB --- */}
        {activeTab === 'auditlogs' && session.user.role === 'Admin' ? (
          <AuditLogs session={session} />
        ) : activeTab === 'agentguard' && session.user.role === 'Admin' ? ("""

if "<AuditLogs" not in text:
    text = text.replace(render_target, render_repl)

with open('frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("Patched App.jsx")
