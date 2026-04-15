/**
 * Admin shell layout: left sidebar + top header + main content.
 * Used by AdminApp for route /admin/:cityId (authenticated view).
 */

import { useState, useEffect } from 'react';
import { SidebarNav, type AdminTabId } from './SidebarNav';
import { TopHeader, type PeriodOption } from './TopHeader';
import './AdminShell.css';

interface AdminShellProps {
  activeTab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
  period: PeriodOption;
  onPeriodChange: (p: PeriodOption) => void;
  liveEnabled: boolean;
  onLiveChange: (enabled: boolean) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function AdminShell({
  activeTab,
  onTabChange,
  period,
  onPeriodChange,
  liveEnabled,
  onLiveChange,
  onLogout,
  children,
}: AdminShellProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(false); // Auto-close sidebar when resizing to desktop
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="admin-shell">
      {isMobile && sidebarOpen && <div className="admin-shell__overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`admin-shell__sidebar ${isMobile ? 'admin-shell__sidebar--mobile' : ''} ${isMobile && sidebarOpen ? 'admin-shell__sidebar--open' : ''}`}>
        <SidebarNav
          activeTab={activeTab}
          onLogout={onLogout}
          onSelect={(tab) => {
            onTabChange(tab);
            if (isMobile) {
              setSidebarOpen(false);
            }
          }}
        />
      </aside>

      <div className={`admin-shell__main-layout ${isMobile ? 'admin-shell__main-layout--mobile' : ''}`}>
        <header className="admin-shell__header">
          <TopHeader
            period={period}
            onPeriodChange={onPeriodChange}
            liveEnabled={liveEnabled}
            onLiveChange={onLiveChange}
            onLogout={onLogout}
            onMenuClick={isMobile ? () => setSidebarOpen(!sidebarOpen) : undefined}
          />
        </header>
        <main className="admin-shell__content">{children}</main>
      </div>
    </div>
  );
}
