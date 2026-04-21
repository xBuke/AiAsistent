import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { LoginForm } from './LoginForm';
import { adminLogin } from './api/adminClient';
import { getEvents, subscribe } from '../analytics/store';
import { generateMockEvents } from './mock/events';
import type { AnalyticsEvent } from '../analytics/types';
import { KnowledgeGaps } from './KnowledgeGaps';
import { Conversations } from './Conversations';
import { Reports } from './Reports';
import { Inbox } from './Inbox';
import { Forms } from './Forms';
import { FormDefinitions } from './FormDefinitions';
import { DocumentsPage } from './DocumentsPage';
import { UsersPage } from './UsersPage';
import { SuperadminPage } from './SuperadminPage';
import { AdminShell } from './components/AdminShell';
import { getVisibleTabsForRole, type AdminTabId } from './components/SidebarNav';
import type { PeriodOption } from './components/TopHeader';
import type { AdminRole } from './api/adminClient';

type DataSource = "Mock" | "Live" | "Combined";

export function AdminApp() {
  const { cityCode } = useParams<{ cityCode?: string }>();
  const cityId = cityCode;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<AdminRole>('admin');
  const [userName, setUserName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedCityCode, setSelectedCityCode] = useState(cityCode || '');
  const [error, setError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const useMock = (import.meta as { env?: { VITE_ADMIN_USE_MOCK?: string } }).env?.VITE_ADMIN_USE_MOCK === 'true';
  const [dataSource, setDataSource] = useState<DataSource>(useMock ? "Mock" : "Live");
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTabId>("Ticketi");
  const [period, setPeriod] = useState<PeriodOption>('7D');
  const [conversationsReloadTrigger, setConversationsReloadTrigger] = useState(0);

  // Live polling toggle - persisted per city in localStorage
  const [liveEnabled, setLiveEnabled] = useState(() => {
    if (!cityId) return true;
    const stored = localStorage.getItem(`admin_live_${cityId}`);
    return stored !== 'false'; // Default to true if not set
  });

  // Reset auth state when cityId changes
  useEffect(() => {
    setIsAuthenticated(false);
    setRole('admin');
    setUserName('');
    setCurrentUserId('');
    setSelectedCityCode(cityId || '');
    setError('');
    // Load live setting for new city
    if (cityId) {
      const stored = localStorage.getItem(`admin_live_${cityId}`);
      setLiveEnabled(stored !== 'false');
    }
  }, [cityId]);

  useEffect(() => {
    const visibleTabs = getVisibleTabsForRole(role);
    if (!visibleTabs.includes(activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0]);
    }
  }, [role, activeTab]);

  // Persist live setting when it changes
  useEffect(() => {
    if (cityId) {
      localStorage.setItem(`admin_live_${cityId}`, String(liveEnabled));
    }
  }, [cityId, liveEnabled]);

  // Update events when dataSource or selected city changes
  useEffect(() => {
    if (!selectedCityCode || !isAuthenticated) return;

    const updateEvents = () => {
      if (!useMock && (dataSource === "Mock" || dataSource === "Combined")) {
        // In production, ignore mock data source if env flag is not set
        setEvents(getEvents(selectedCityCode));
        return;
      }

      let mockData: AnalyticsEvent[] = [];
      let liveData: AnalyticsEvent[] = [];

      if (dataSource === "Mock" || dataSource === "Combined") {
        mockData = generateMockEvents(selectedCityCode);
      }

      if (dataSource === "Live" || dataSource === "Combined") {
        liveData = getEvents(selectedCityCode);
      }

      if (dataSource === "Combined") {
        // Merge and deduplicate by id, keeping the most recent
        const merged = [...mockData, ...liveData];
        const unique = new Map<string, AnalyticsEvent>();
        merged.forEach(event => {
          const existing = unique.get(event.id);
          if (!existing || event.timestamp > existing.timestamp) {
            unique.set(event.id, event);
          }
        });
        setEvents(Array.from(unique.values()).sort((a, b) => b.timestamp - a.timestamp));
      } else if (dataSource === "Mock") {
        setEvents(mockData);
      } else {
        setEvents(liveData);
      }
    };

    updateEvents();

    // Subscribe to live updates if using Live or Combined
    if (dataSource === "Live" || dataSource === "Combined") {
      const unsubscribe = subscribe(updateEvents);
      return unsubscribe;
    }
  }, [dataSource, selectedCityCode, isAuthenticated, useMock]);

  const handleLogin = async (loginCityCode: string, password: string) => {
    setError('');
    setIsLoggingIn(true);

    try {
      const result = await adminLogin({ cityCode: loginCityCode, password });
      if (result) {
        setRole(result.role);
        setUserName(result.userName || '');
        setCurrentUserId(result.userId || '');
        setSelectedCityCode(loginCityCode);
        if (result.role !== 'superadmin') {
          const visibleTabs = getVisibleTabsForRole(result.role);
          if (visibleTabs.length > 0) {
            setActiveTab(visibleTabs[0]);
          }
        }
        setIsAuthenticated(true);
        setError('');
      } else {
        setError('Invalid password');
        setIsAuthenticated(false);
      }
    } catch (err) {
      // Network error or backend unreachable
      setError('Unable to connect to backend. Please try again.');
      setIsAuthenticated(false);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Show login form if not authenticated
  if (!isAuthenticated) {
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
        <header
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#111827',
            }}
          >
            Admin login
          </h1>
        </header>
        <div style={{ flex: 1, padding: '2rem' }}>
          <LoginForm
            onSubmit={handleLogin}
            error={error}
            isLoading={isLoggingIn}
            cityCode={cityId || ''}
          />
        </div>
      </div>
    );
  }

  if (role === 'superadmin' || selectedCityCode === 'superadmin') {
    return <SuperadminPage onLogout={() => setIsAuthenticated(false)} />;
  }

  // Authenticated view: Admin shell (sidebar + header + main)
  return (
    <AdminShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      period={period}
      onPeriodChange={setPeriod}
      liveEnabled={liveEnabled}
      onLiveChange={setLiveEnabled}
      role={role}
      userName={userName}
      cityCode={selectedCityCode}
      onLogout={() => setIsAuthenticated(false)}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {/* Data Source Toggle - only show for Dashboard and Reports, and only if mock is enabled */}
        {activeTab === "Reports" && useMock && (
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Data Source:
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(["Mock", "Live", "Combined"] as DataSource[]).map((source) => (
                  <button
                    key={source}
                    onClick={() => setDataSource(source)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: dataSource === source ? '#3b82f6' : '#f3f4f6',
                      color: dataSource === source ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (dataSource !== source) {
                        e.currentTarget.style.backgroundColor = '#e5e7eb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (dataSource !== source) {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                      }
                    }}
                  >
                    {source}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === "Dashboard" && (
          <KnowledgeGaps />
        )}
        {activeTab === "Ticketi" && selectedCityCode && (
          <Inbox
            cityId={selectedCityCode}
            liveEnabled={liveEnabled}
            onNavigateToAllConversations={() => setActiveTab("Svi razgovori")}
            onNeedsHumanToggledOff={() => {
              // Trigger reload of Conversations tab when needs_human is toggled off
              setConversationsReloadTrigger(prev => prev + 1);
            }}
          />
        )}
        {activeTab === "Svi razgovori" && selectedCityCode && (
          <Conversations
            cityId={selectedCityCode}
            liveEnabled={liveEnabled}
            reloadTrigger={conversationsReloadTrigger}
          />
        )}
        {activeTab === "Reports" && <Reports />}
        {activeTab === "Obrasci" && <Forms />}
        {activeTab === "Postavke formi" && <FormDefinitions />}
        {activeTab === "Dokumenti" && selectedCityCode && <DocumentsPage cityId={selectedCityCode} />}
        {activeTab === "Korisnici" && role === 'admin' && (
          <UsersPage cityCode={selectedCityCode} currentUserId={currentUserId} />
        )}
      </div>
    </AdminShell>
  );
}
