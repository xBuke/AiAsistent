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

const PERIOD_OPTIONS: PeriodOption[] = ['7D', 'Monthly', 'Yearly'];

export function TopHeader({
  period,
  onPeriodChange,
  liveEnabled,
  onLiveChange,
  onLogout,
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
    <header
      style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          style={{
            padding: '0.5rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      )}
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
            fontWeight: 600,
            color: '#111827',
            lineHeight: 1.3,
          }}
        >
          Uvid u komunikaciju s građanima
        </h1>
        {!isSmallScreen && (
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: 'clamp(0.75rem, 2vw, 0.8125rem)',
              color: '#6b7280',
              lineHeight: 1.4,
            }}
          >
            Pregled onoga što građani pitaju, trebaju i gdje Grad može reagirati
          </p>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Period switch (UI only) - hide on very small screens */}
        {!isSmallScreen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onPeriodChange(opt)}
                style={{
                  padding: '0.375rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: period === opt ? 600 : 500,
                  color: period === opt ? '#111827' : '#6b7280',
                  backgroundColor: period === opt ? '#f3f4f6' : 'transparent',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background-color 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (period !== opt) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (period !== opt) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Status badge placeholder - hide on small screens */}
        {!isSmallScreen && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.375rem 0.75rem',
              fontSize: '0.8125rem',
              color: '#374151',
              backgroundColor: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '0.25rem',
            }}
          >
            <span style={{ fontSize: '0.625rem' }}>🟢</span>
            Stanje komunikacije
          </span>
        )}

        {/* Live toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#374151',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={liveEnabled}
            onChange={(e) => onLiveChange(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Live</span>
        </label>

        <button
          type="button"
          onClick={onLogout}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ef4444';
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
