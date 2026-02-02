/**
 * Left sidebar navigation for Admin shell.
 * Same layout for all roles; drives tab state (Dashboard, Inbox, Conversations, Reports).
 */

export type AdminTabId = 'Dashboard' | 'Ticketi' | 'Svi razgovori' | 'Reports';

const NAV_ITEMS: { id: AdminTabId; label: string }[] = [
  { id: 'Dashboard', label: 'Dashboard' },
  { id: 'Ticketi', label: 'Upiti koji traze reakciju' },
  { id: 'Svi razgovori', label: 'Razgovori' },
  { id: 'Reports', label: 'Reports' },
];

interface SidebarNavProps {
  activeTab: AdminTabId;
  onSelect: (tab: AdminTabId) => void;
}

export function SidebarNav({ activeTab, onSelect }: SidebarNavProps) {
  return (
    <nav
      style={{
        width: '240px',
        flexShrink: 0,
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        padding: '1rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
    >
      {NAV_ITEMS.map(({ id, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.625rem 1.25rem',
              textAlign: 'left',
              fontSize: '0.875rem',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? '#111827' : '#4b5563',
              backgroundColor: isActive ? '#f3f4f6' : 'transparent',
              border: 'none',
              borderLeft: isActive ? '3px solid #374151' : '3px solid transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
