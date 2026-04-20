import type { AdminRole } from '../api/adminClient';

export type AdminTabId =
  | 'Dashboard'
  | 'Ticketi'
  | 'Svi razgovori'
  | 'Reports'
  | 'Obrasci'
  | 'Postavke formi'
  | 'Dokumenti'
  | 'Korisnici';

const NAV_ITEMS: { id: AdminTabId; label: string }[] = [
  { id: 'Svi razgovori', label: 'Konverzacije' },
  { id: 'Ticketi', label: 'Ticketi' },
  { id: 'Obrasci', label: 'Forme' },
  { id: 'Postavke formi', label: 'Postavke formi' },
  { id: 'Dokumenti', label: 'Dokumenti' },
  { id: 'Dashboard', label: 'Knowledge Gaps' },
  { id: 'Reports', label: 'Izvještaji' },
  { id: 'Korisnici', label: 'Korisnici' },
];

const ROLE_VISIBLE_TABS: Record<Exclude<AdminRole, 'superadmin'>, AdminTabId[]> = {
  admin: ['Svi razgovori', 'Ticketi', 'Obrasci', 'Postavke formi', 'Dokumenti', 'Dashboard', 'Reports', 'Korisnici'],
  inbox: ['Ticketi', 'Obrasci'],
  conversations: ['Svi razgovori'],
  forms: ['Obrasci'],
  readonly: ['Reports'],
};

export function getVisibleTabsForRole(role: AdminRole): AdminTabId[] {
  if (role === 'superadmin') return [];
  return ROLE_VISIBLE_TABS[role];
}

interface SidebarNavProps {
  activeTab: AdminTabId;
  onSelect: (tab: AdminTabId) => void;
  role: AdminRole;
  userName?: string;
  cityCode?: string;
  onLogout?: () => void;
}

function NavIcon({ tabId }: { tabId: AdminTabId }) {
  switch (tabId) {
    case 'Svi razgovori':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 18l-4 3V7a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H7z" />
        </svg>
      );
    case 'Ticketi':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          <path d="M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2" />
        </svg>
      );
    case 'Obrasci':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      );
    case 'Postavke formi':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 21h16M6 21V8l6-4 6 4v13" />
          <path d="M6 12h12M6 16h12" />
        </svg>
      );
    case 'Dokumenti':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
      );
    case 'Dashboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 3a7 7 0 014.8 12.1A4.4 4.4 0 0015.4 18h-6.8A4.4 4.4 0 007.2 15.1 7 7 0 0112 3z" />
        </svg>
      );
    case 'Reports':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20V9" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20v-11" />
        </svg>
      );
    case 'Korisnici':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    default:
      return null;
  }
}

export function SidebarNav({ activeTab, onSelect, role, userName, cityCode, onLogout }: SidebarNavProps) {
  const visibleTabs = getVisibleTabsForRole(role);

  return (
    <nav className="admin-sidebar-nav" aria-label="Admin sidebar">
      <div className="admin-sidebar-nav__wordmark">Civis</div>
      <div className="admin-sidebar-nav__divider" />

      <ul className="admin-sidebar-nav__list">
        {NAV_ITEMS.filter(({ id }) => visibleTabs.includes(id)).map(({ id, label }) => {
          const isActive = activeTab === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={`admin-sidebar-nav__item ${isActive ? 'admin-sidebar-nav__item--active' : ''}`}
              >
                <span className="admin-sidebar-nav__icon">
                  <NavIcon tabId={id} />
                </span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="admin-sidebar-nav__footer">
        <div className="admin-sidebar-nav__city">{cityCode || 'Civis'}</div>
        {userName && <div className="admin-sidebar-nav__city">{userName}</div>}
        <button type="button" className="admin-sidebar-nav__logout" onClick={onLogout}>
          Odjava
        </button>
      </div>
    </nav>
  );
}
