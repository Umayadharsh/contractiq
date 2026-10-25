import React, { useState, useRef, useEffect } from 'react';
import { Menu, ChevronDown, User, LogOut, Shield } from 'lucide-react';
import Badge from '../common/Badge';

export default function Topbar({
  activeTab,
  session,
  onOpenMobileNav,
  onSignOut,
  onUploadClick,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tabLabels = {
    dashboard: 'Dashboard',
    contracts: 'Contracts',
    pending: 'Pending Approvals',
    playbook: 'Compliance Playbook',
    agentguard: 'AgentGuard Policies',
    auditlogs: 'Audit Logs',
  };

  const currentTitle = tabLabels[activeTab] || 'Workspace';
  const role = session?.user?.role || 'Viewer';

  return (
    <header className="ciq-topbar">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="ciq-topbar-left">
        <button
          type="button"
          className="ciq-mobile-menu-btn"
          onClick={onOpenMobileNav}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <div className="ciq-breadcrumbs">
          <span className="ciq-breadcrumb-crumb">ContractIQ</span>
          <span>/</span>
          <span className="ciq-breadcrumb-current">{currentTitle}</span>
        </div>
      </div>

      {/* Right: Actions, Role Badge & Profile Dropdown */}
      <div className="ciq-topbar-right">
        {onUploadClick && ['Admin', 'Reviewer'].includes(role) && (
          <button
            type="button"
            className="ciq-btn ciq-btn-primary ciq-btn-sm"
            onClick={onUploadClick}
          >
            + Upload Contract
          </button>
        )}

        <Badge
          variant={role === 'Admin' ? 'info' : role === 'Reviewer' ? 'warning' : 'neutral'}
          pill
        >
          {role}
        </Badge>

        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            type="button"
            className="ciq-btn ciq-btn-ghost ciq-btn-sm"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.6rem',
            }}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            <div
              className="ciq-user-avatar"
              style={{ width: '26px', height: '26px', fontSize: '0.72rem' }}
            >
              {session?.user?.name ? session.user.name[0].toUpperCase() : 'U'}
            </div>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ciq-text-title)' }}>
              {session?.user?.name || 'Account'}
            </span>
            <ChevronDown size={14} style={{ color: 'var(--ciq-text-muted)' }} />
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '230px',
                backgroundColor: 'var(--ciq-surface)',
                border: '1px solid var(--ciq-border)',
                borderRadius: 'var(--ciq-radius-lg)',
                boxShadow: 'var(--ciq-shadow-dropdown)',
                zIndex: 50,
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <div
                style={{
                  padding: '0.65rem 0.75rem',
                  borderBottom: '1px solid var(--ciq-border-light)',
                  marginBottom: '0.25rem',
                }}
              >
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ciq-text-title)' }}>
                  {session?.user?.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ciq-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {session?.user?.email}
                </div>
                <div style={{ marginTop: '0.4rem' }}>
                  <Badge variant="neutral" pill>
                    Role: {role}
                  </Badge>
                </div>
              </div>

              <button
                type="button"
                className="ciq-btn ciq-btn-ghost ciq-btn-sm"
                onClick={() => {
                  setDropdownOpen(false);
                  onSignOut();
                }}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  color: 'var(--ciq-danger-text)',
                  padding: '0.5rem 0.75rem',
                }}
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
