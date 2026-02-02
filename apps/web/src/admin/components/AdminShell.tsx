/**
 * Admin shell layout: left sidebar + top header + main content.
 * Used by AdminApp for route /admin/:cityId (authenticated view).
 */

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
      />
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
        }}
      >
        <SidebarNav activeTab={activeTab} onSelect={onTabChange} />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            padding: '1.5rem',
            overflow: 'auto',
            backgroundColor: '#f9fafb',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
