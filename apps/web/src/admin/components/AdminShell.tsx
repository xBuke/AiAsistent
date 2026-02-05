/**
 * Admin shell layout: left sidebar + top header + main content.
 * Used by AdminApp for route /admin/:cityId (authenticated view).
 */

import { useState, useEffect } from 'react';
import { SidebarNav, type AdminTabId } from './SidebarNav';
import { TopHeader, type PeriodOption } from './TopHeader';

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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        backgroundColor: '#f9fafb',
      }}
    >
      <TopHeader
        period={period}
        onPeriodChange={onPeriodChange}
        liveEnabled={liveEnabled}
        onLiveChange={onLiveChange}
        onLogout={onLogout}
        onMenuClick={isMobile ? () => setSidebarOpen(!sidebarOpen) : undefined}
      />
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          position: 'relative',
        }}
      >
        {/* Mobile sidebar overlay */}
        {isMobile && sidebarOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 998,
            }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          style={{
            width: isMobile ? (sidebarOpen ? '240px' : '0') : '240px',
            flexShrink: 0,
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            position: isMobile ? 'fixed' : 'relative',
            left: isMobile ? (sidebarOpen ? 0 : '-240px') : 0,
            top: isMobile ? 0 : 'auto',
            bottom: isMobile ? 0 : 'auto',
            height: isMobile ? '100vh' : 'auto',
            zIndex: isMobile ? 999 : 'auto',
            backgroundColor: '#ffffff',
            borderRight: '1px solid #e5e7eb',
          }}
        >
          <SidebarNav
            activeTab={activeTab}
            onSelect={(tab) => {
              onTabChange(tab);
              if (isMobile) {
                setSidebarOpen(false);
              }
            }}
          />
        </div>
        <main
          style={{
            flex: 1,
            minWidth: 0,
            padding: isMobile ? '1rem' : '1.5rem',
            overflow: 'auto',
            backgroundColor: '#f9fafb',
            width: isMobile && sidebarOpen ? 0 : 'auto',
            transition: 'width 0.3s ease',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
