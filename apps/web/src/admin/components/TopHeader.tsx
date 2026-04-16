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
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const checkScreen = () => setIsSmallScreen(window.innerWidth < 640);
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem('civis-theme');
    const resolvedTheme = storedTheme === 'light' ? 'light' : 'dark';
    setTheme(resolvedTheme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('civis-theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

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
      <button
        type="button"
        className="admin-top-header__theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Uključi svijetlu temu' : 'Uključi tamnu temu'}
      >
        {theme === 'dark' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 2V5M12 19V22M4.93 4.93L7.05 7.05M16.95 16.95L19.07 19.07M2 12H5M19 12H22M4.93 19.07L7.05 16.95M16.95 7.05L19.07 4.93" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7.2 7.2 0 0 0 9.8 9.8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </header>
  );
}
