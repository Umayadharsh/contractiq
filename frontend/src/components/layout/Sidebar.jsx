import React from 'react';
import {
  LayoutDashboard,
  FileText,
  ShieldCheck,
  Sliders,
  Clock,
  ScrollText,
  LogOut,
  X,
  Sparkles,
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  session,
  contractCount = 0,
  pendingCount = 0,
  isOpen = false,
  onClose,
  onSignOut,
}) {
  const role = session?.user?.role || 'Viewer';

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      show: true,
    },
    {
      id: 'contracts',
      label: 'Contracts',
      icon: FileText,
      badge: contractCount,
      show: true,
    },
    {
      id: 'pending',
      label: 'Pending Approvals',
      icon: Clock,
      badge: pendingCount,
      show: role !== 'Viewer',
      alert: pendingCount > 0,
    },
    {
      id: 'playbook',
      label: 'Playbook Rules',
      icon: ShieldCheck,
      show: role === 'Admin',
    },
    {
      id: 'agentguard',
      label: 'AgentGuard Policies',
      icon: Sliders,
      show: role === 'Admin',
    },
    {
      id: 'auditlogs',
      label: 'Audit Logs',
      icon: ScrollText,
      show: role === 'Admin',
    },
  ];

  const handleNavClick = (tabId) => {
    setActiveTab(tabId);
    if (onClose) onClose();
  };

  const userInitials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="ciq-modal-backdrop"
          style={{ zIndex: 35 }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`ciq-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="ciq-sidebar-header">
          <div className="ciq-logo-block">
            <div className="ciq-logo-icon">C</div>
            <div className="ciq-logo-text-wrap">
              <span className="ciq-logo-title">ContractIQ</span>
              <span className="ciq-logo-badge">Guard Workspace</span>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              className="ciq-mobile-menu-btn"
              onClick={onClose}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Navigation Body */}
        <nav className="ciq-nav-body">
          <div className="ciq-nav-section-title">Navigation</div>
          {navItems
            .filter((item) => item.show)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`ciq-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.id)}
                >
                  <div className="ciq-nav-link-content">
                    <span className="ciq-nav-icon">
                      <Icon size={18} />
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`ciq-counter-pill ${
                        item.alert && !isActive ? 'ciq-badge-warning' : ''
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>

        {/* User Card & Sign Out */}
        <div className="ciq-sidebar-footer">
          <div className="ciq-user-card">
            <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <div className="ciq-user-avatar">{userInitials}</div>
              <div className="ciq-user-info">
                <span className="ciq-user-name" title={session?.user?.name || session?.user?.email}>
                  {session?.user?.name || 'Workspace User'}
                </span>
                <span className="ciq-user-role">{role}</span>
              </div>
            </div>
            <button
              type="button"
              className="ciq-btn ciq-btn-ghost ciq-btn-sm"
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              style={{ padding: '0.4rem', color: 'var(--ciq-text-muted)' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
