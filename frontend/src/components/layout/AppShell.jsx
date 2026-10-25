import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Toast from '../common/Toast';

export default function AppShell({
  activeTab,
  setActiveTab,
  session,
  contractCount = 0,
  pendingCount = 0,
  message,
  onClearMessage,
  onSignOut,
  onUploadClick,
  children,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="ciq-app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        session={session}
        contractCount={contractCount}
        pendingCount={pendingCount}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onSignOut={onSignOut}
      />

      {/* Main Content Area */}
      <div className="ciq-main-wrapper">
        <Topbar
          activeTab={activeTab}
          session={session}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onSignOut={onSignOut}
          onUploadClick={onUploadClick}
        />

        <main className="ciq-content-container">
          {children}
        </main>
      </div>

      {/* Toast Alert */}
      {message && (
        <Toast
          message={message}
          onClose={onClearMessage}
        />
      )}
    </div>
  );
}
