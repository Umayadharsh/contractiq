import os

with open('backend/src/server.js', 'r') as f:
    text = f.read()

if "import auditLogRoutes from './routes/auditLogs.js';" not in text:
    text = text.replace("import agentGuardRoutes from './routes/agentGuard.js';", "import agentGuardRoutes from './routes/agentGuard.js';\nimport auditLogRoutes from './routes/auditLogs.js';")
    
if "app.use('/api/audit-logs', auditLogRoutes);" not in text:
    text = text.replace("app.use('/api/agentguard', agentGuardRoutes);", "app.use('/api/agentguard', agentGuardRoutes);\napp.use('/api/audit-logs', auditLogRoutes);")

with open('backend/src/server.js', 'w') as f:
    f.write(text)

print("Mounted auditLogs routes in server.js")
