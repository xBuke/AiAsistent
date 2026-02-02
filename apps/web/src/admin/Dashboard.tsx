import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { StatCard } from './components/StatCard';
import { LineChart } from './components/LineChart';
import { BarChart } from './components/BarChart';
import { FiltersBar } from './components/FiltersBar';
import { Drawer } from './components/Drawer';
import {
  fetchDashboardSummary,
  fetchQuestionExamples,
  fetchKnowledgeGapDetail,
  fetchTicketDetail,
  type DashboardSummary,
  type QuestionExamples,
  type KnowledgeGapDetail,
  type ApiConversationDetail,
} from './api/adminClient';
import { getAllCategories } from './utils/analytics';
import type { FilterState } from './utils/analytics';
import { formatDateTime } from './utils/dateFormat';
import { categoryDisplayLabel } from './utils/categories';

const PREVIEW_TICKETS_COUNT = 5;
const PREVIEW_QUESTIONS_COUNT = 5;

interface DashboardProps {
  events: any[];
  onViewAllTickets?: () => void;
  onViewAllQuestions?: () => void;
}

export function Dashboard({ events, onViewAllTickets, onViewAllQuestions }: DashboardProps) {
  const { cityId } = useParams<{ cityId: string }>();
  const [filters, setFilters] = useState<FilterState>({
    dateRange: '7d',
    category: 'All',
    searchQuery: '',
  });
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Drawer states
  const [drawerType, setDrawerType] = useState<'question' | 'knowledge-gap' | 'ticket' | null>(null);
  const [drawerData, setDrawerData] = useState<QuestionExamples | KnowledgeGapDetail | ApiConversationDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Get all categories from events for filter dropdown (fallback)
  const allCategories = useMemo(() => getAllCategories(events), [events]);

  // Fetch dashboard summary
  const loadSummary = useCallback(async () => {
    if (!cityId) return;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardSummary(cityId, {
        range: filters.dateRange as '24h' | '7d' | '30d',
        category: filters.category === 'All' ? undefined : filters.category,
        search: filters.searchQuery || undefined,
      });
      setSummary(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch dashboard summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      setLoading(false);
    }
  }, [cityId, filters]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Handle drawer opens
  const handleQuestionClick = useCallback(async (question: string) => {
    setDrawerType('question');
    setDrawerLoading(true);
    setDrawerData(null);
    try {
      const data = await fetchQuestionExamples({
        question,
        range: filters.dateRange as '24h' | '7d' | '30d',
      });
      setDrawerData(data);
    } catch (err) {
      console.error('Failed to fetch question examples:', err);
      setDrawerData(null);
    } finally {
      setDrawerLoading(false);
    }
  }, [filters.dateRange]);

  const handleKnowledgeGapClick = useCallback(async (id: string) => {
    setDrawerType('knowledge-gap');
    setDrawerLoading(true);
    setDrawerData(null);
    try {
      const data = await fetchKnowledgeGapDetail(id);
      setDrawerData(data);
    } catch (err) {
      console.error('Failed to fetch knowledge gap detail:', err);
      setDrawerData(null);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const handleTicketClick = useCallback(async (ticketId: string) => {
    if (!cityId) return;
    setDrawerType('ticket');
    setDrawerLoading(true);
    setDrawerData(null);
    try {
      const data = await fetchTicketDetail(cityId, ticketId);
      setDrawerData(data);
    } catch (err) {
      console.error('Failed to fetch ticket detail:', err);
      setDrawerData(null);
    } finally {
      setDrawerLoading(false);
    }
  }, [cityId]);

  const closeDrawer = useCallback(() => {
    setDrawerType(null);
    setDrawerData(null);
  }, []);

  // Extract categories from summary for filters
  const categoriesFromSummary = useMemo(() => {
    if (!summary) return allCategories;
    const cats = new Set<string>();
    summary.charts.top_categories.forEach(c => cats.add(c.category));
    return Array.from(cats).sort();
  }, [summary, allCategories]);

  const topCategoryLabel = summary?.charts?.top_categories?.length
    ? categoryDisplayLabel(summary.charts.top_categories[0].category)
    : '—';
  const previewTickets = summary?.tickets_preview?.slice(0, PREVIEW_TICKETS_COUNT) ?? [];
  const previewQuestions = summary?.top_questions?.slice(0, PREVIEW_QUESTIONS_COUNT) ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      {/* Filter bar — full-width control section */}
      <div
        style={{
          width: '100%',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          paddingTop: '1rem',
          paddingBottom: '1rem',
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
          }}
        >
          <FiltersBar
            filters={filters}
            onFiltersChange={setFilters}
            categories={categoriesFromSummary}
          />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.875rem',
          }}
        >
          Loading dashboard...
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          Error: {error}
        </div>
      )}

      {/* Dashboard Content */}
      {!loading && !error && summary && (
        <>
          {/* ROW 1 — KPI Summary (full width) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
              gap: '1rem',
              alignItems: 'stretch',
            }}
          >
            <StatCard title="Ukupan broj razgovora" value={summary.kpis.conversations_total} />
            <StatCard title="Upiti za koje je potrebna reakcija Grada" value={summary.kpis.tickets_open} />
            <StatCard title="Najčešća tema razgovora" value={topCategoryLabel} />
            <StatCard title="Raspoloženje građana" value="Stabilno" />
          </div>

          {/* ROW 2 — Hero: Charts above the fold (8 / 4) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
              gap: '1.25rem',
              alignItems: 'stretch',
            }}
          >
            {/* Left (8 cols): Pitanja po danu */}
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '1.25rem 1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
                border: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.0625rem', fontWeight: 600, color: '#111827' }}>Pitanja po danu</h3>
              <div style={{ flex: 1, minHeight: 0 }}>
                <LineChart data={summary.charts.questions_per_day} width={600} height={200} />
              </div>
            </div>
            {/* Right (4 cols): Top kategorije */}
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '1.25rem 1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
                border: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.0625rem', fontWeight: 600, color: '#111827' }}>Top kategorije</h3>
              <div style={{ flex: 1, minHeight: 0 }}>
                <BarChart
                  data={summary.charts.top_categories.map((c) => ({
                    category: categoryDisplayLabel(c.category),
                    count: c.count,
                  }))}
                  width={280}
                  height={200}
                />
              </div>
            </div>
          </div>

          {/* ROW 3 — O čemu građani najviše pitaju (preview) */}
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '1.25rem 1.5rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
              border: '1px solid #e5e7eb',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>
                O čemu građani najviše pitaju
              </h2>
              {onViewAllQuestions && (
                <button
                  type="button"
                  onClick={onViewAllQuestions}
                  style={{
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: '#374151',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                >
                  Pogledaj sve
                </button>
              )}
            </div>
            {previewQuestions.length === 0 ? (
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Nema dostupnih podataka za odabrani period.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flex: 1, minHeight: 0 }}>
                {previewQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleQuestionClick(q.question)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s, border-color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      minHeight: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                  >
                    <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.question}>{q.question}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0 }}>{q.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ROW 4 — Insight + Signal (6 / 6) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1.25rem',
              alignItems: 'stretch',
            }}
          >
            {/* Left (6 cols): Sažetak komunikacije */}
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '1rem 1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
                border: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.0625rem', fontWeight: 600, color: '#111827' }}>Sažetak komunikacije – zadnjih 7 dana</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', lineHeight: 1.5 }}>
                Većina upita odnosi se na komunalne teme i administrativne informacije. Dio upita zahtijeva daljnju obradu od strane gradske uprave.
              </p>
            </div>
            {/* Right (6 cols): Upiti za koje je potrebna reakcija Grada */}
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '1rem 1.5rem',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08)',
                border: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 600, color: '#111827' }}>Upiti za koje je potrebna reakcija Grada</h3>
                {onViewAllTickets && (
                  <button
                    type="button"
                    onClick={onViewAllTickets}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#374151',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                  >
                    Pogledaj sve
                  </button>
                )}
              </div>
              {previewTickets.length === 0 ? (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Nema upita za koje je potrebna reakcija Grada.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minHeight: 0 }}>
                  {previewTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      onClick={() => handleTicketClick(ticket.id)}
                      style={{
                        padding: '0.75rem 1rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ fontSize: '0.875rem', color: '#111827', marginBottom: '0.25rem' }}>{ticket.question || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{formatDateTime(ticket.created_at)}{ticket.status ? ` · ${ticket.status}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Drawer */}
      <Drawer
        isOpen={drawerType !== null}
        onClose={closeDrawer}
        title={
          drawerType === 'question'
            ? 'Question Examples'
            : drawerType === 'knowledge-gap'
            ? 'Knowledge Gap Details'
            : 'Ticket Details'
        }
      >
        {drawerLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            Loading...
          </div>
        ) : drawerData ? (
          <>
            {drawerType === 'question' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                    Normalized Question
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>
                    {(drawerData as QuestionExamples).question}
                  </p>
                </div>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                    Examples ({((drawerData as QuestionExamples).examples || []).length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {((drawerData as QuestionExamples).examples || []).map((ex, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '0.375rem',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontSize: '0.875rem', color: '#111827', marginBottom: '0.25rem' }}>
                          {ex.content}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {formatDateTime(ex.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {drawerType === 'knowledge-gap' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                    Question
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>
                    {(drawerData as KnowledgeGapDetail).question}
                  </p>
                </div>
                {(drawerData as KnowledgeGapDetail).reason && (
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                      Reason
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>
                      {(drawerData as KnowledgeGapDetail).reason}
                    </p>
                  </div>
                )}
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                    Occurrences: {(drawerData as KnowledgeGapDetail).occurrences}
                  </h4>
                </div>
                {((drawerData as KnowledgeGapDetail).examples || []).length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                      Examples
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {((drawerData as KnowledgeGapDetail).examples || []).map((ex, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#f9fafb',
                            borderRadius: '0.375rem',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ fontSize: '0.875rem', color: '#111827', marginBottom: '0.25rem' }}>
                            {ex.content}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {formatDateTime(ex.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {drawerType === 'ticket' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                    Status
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>
                    {(drawerData as ApiConversationDetail).conversation.status || 'open'}
                  </p>
                </div>
                {(drawerData as ApiConversationDetail).conversation.category && (
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                      Kategorija
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151' }}>
                      {categoryDisplayLabel((drawerData as ApiConversationDetail).conversation.category)}
                    </p>
                  </div>
                )}
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                    Messages ({((drawerData as ApiConversationDetail).messages || []).length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
                    {((drawerData as ApiConversationDetail).messages || []).map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          padding: '0.75rem',
                          backgroundColor: msg.role === 'user' ? '#f0f9ff' : '#f9fafb',
                          borderRadius: '0.375rem',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.25rem' }}>
                          {msg.role === 'user' ? 'User' : 'Assistant'}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#111827' }}>
                          {msg.content_redacted || '-'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                          {formatDateTime(msg.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            No data available
          </div>
        )}
      </Drawer>
    </div>
  );
}
