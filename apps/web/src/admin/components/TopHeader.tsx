/**
 * Top header bar for Admin shell.
 * Title + subtitle, period switch (UI-only), status badge placeholder, logout + live toggle.
 */

import { useState, useEffect } from 'react';

export type PeriodOption = '7D' | 'Monthly' | 'Yearly';

interface TopHeaderProps {
  period: PeriodOption;
  onPeriodChange: (p: PeriodOption) => void;
  liveEnabled: boolean;
  onLiveChange: (enabled: boolean) => void;
  onLogout: () => void;
  onMenuClick?: () => void;
}

export function TopHeader({
  period: _period,
  onPeriodChange: _onPeriodChange,
  liveEnabled: _liveEnabled,
  onLiveChange: _onLiveChange,
  onLogout: _onLogout,
  onMenuClick,
}: TopHeaderProps) {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const checkScreen = () => setIsSmallScreen(window.innerWidth < 640);
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);
  return (
    <header className="admin-top-header">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="admin-top-header__menu"
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      )}
      <div className="admin-top-header__spacer">
        {!isSmallScreen && <span className="admin-top-header__crumb">Administracija</span>}
      </div>
    </header>
  );
}
