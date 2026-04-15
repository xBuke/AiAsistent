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
import './Dashboard.css';

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
    <div className="admin-dashboard">
      {/* Filter bar — full-width control section */}
      <div className="admin-dashboard__filters">
        <div className="admin-dashboard__filters-inner">
          <FiltersBar
            filters={filters}
            onFiltersChange={setFilters}
            categories={categoriesFromSummary}
          />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="admin-dashboard__state">Loading dashboard...</div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="admin-dashboard__error">Error: {error}</div>
      )}

      {/* Dashboard Content */}
      {!loading && !error && summary && (
        <>
          {/* ROW 1 — KPI Summary (full width) */}
          <div className="admin-dashboard__kpi-grid">
            <StatCard title="Ukupan broj razgovora" value={summary.kpis.conversations_total} />
            <StatCard title="Upiti za koje je potrebna reakcija Grada" value={summary.kpis.tickets_open} />
            <StatCard title="Najčešća tema razgovora" value={topCategoryLabel} />
            <StatCard title="Raspoloženje građana" value="Stabilno" />
          </div>

          {/* ROW 2 — Hero: Charts above the fold (8 / 4) */}
          <div className="admin-dashboard__charts-grid">
            {/* Left (8 cols): Pitanja po danu */}
            <div className="admin-card admin-dashboard__chart-card">
              <h3 className="admin-dashboard__section-title">Pitanja po danu</h3>
              <div className="admin-dashboard__chart-content">
                <LineChart data={summary.charts.questions_per_day} width={600} height={200} />
              </div>
            </div>
            {/* Right (4 cols): Top kategorije */}
            <div className="admin-card admin-dashboard__chart-card">
              <h3 className="admin-dashboard__section-title">Top kategorije</h3>
              <div className="admin-dashboard__chart-content">
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
          <div className="admin-card admin-dashboard__panel">
            <div className="admin-dashboard__panel-header">
              <h2 className="admin-dashboard__section-title">
                O čemu građani najviše pitaju
              </h2>
              {onViewAllQuestions && (
                <button
                  type="button"
                  onClick={onViewAllQuestions}
                  className="admin-btn-secondary"
                >
                  Pogledaj sve
                </button>
              )}
            </div>
            {previewQuestions.length === 0 ? (
              <p className="admin-dashboard__muted">Nema dostupnih podataka za odabrani period.</p>
            ) : (
              <div className="admin-dashboard__list">
                {previewQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleQuestionClick(q.question)}
                    className="admin-dashboard__list-item"
                  >
                    <span className="admin-dashboard__list-item-title" title={q.question}>{q.question}</span>
                    <span className="admin-dashboard__list-item-count">{q.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ROW 4 — Insight + Signal (6 / 6) */}
          <div className="admin-dashboard__charts-grid">
            {/* Left (6 cols): Sažetak komunikacije */}
            <div className="admin-card admin-dashboard__panel">
              <h3 className="admin-dashboard__section-title">Sažetak komunikacije – zadnjih 7 dana</h3>
              <p className="admin-dashboard__text">
                Većina upita odnosi se na komunalne teme i administrativne informacije. Dio upita zahtijeva daljnju obradu od strane gradske uprave.
              </p>
            </div>
            {/* Right (6 cols): Upiti za koje je potrebna reakcija Grada */}
            <div className="admin-card admin-dashboard__panel">
              <div className="admin-dashboard__panel-header">
                <h3 className="admin-dashboard__section-title">Upiti za koje je potrebna reakcija Grada</h3>
                {onViewAllTickets && (
                  <button
                    type="button"
                    onClick={onViewAllTickets}
                    className="admin-btn-secondary"
                  >
                    Pogledaj sve
                  </button>
                )}
              </div>
              {previewTickets.length === 0 ? (
                <p className="admin-dashboard__muted">Nema upita za koje je potrebna reakcija Grada.</p>
              ) : (
                <div className="admin-dashboard__list">
                  {previewTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      onClick={() => handleTicketClick(ticket.id)}
                      className="admin-dashboard__list-item"
                    >
                      <div className="admin-dashboard__list-item-title">{ticket.question || '—'}</div>
                      <div className="admin-dashboard__list-item-meta">{formatDateTime(ticket.created_at)}{ticket.status ? ` · ${ticket.status}` : ''}</div>
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
          <div className="admin-dashboard__drawer-state">Loading...</div>
        ) : drawerData ? (
          <>
            {drawerType === 'question' && (
              <div className="admin-dashboard__drawer-stack">
                <div>
                  <h4 className="admin-dashboard__drawer-title">Normalized Question</h4>
                  <p className="admin-dashboard__drawer-text">
                    {(drawerData as QuestionExamples).question}
                  </p>
                </div>
                <div>
                  <h4 className="admin-dashboard__drawer-title">
                    Examples ({((drawerData as QuestionExamples).examples || []).length})
                  </h4>
                  <div className="admin-dashboard__drawer-stack-sm">
                    {((drawerData as QuestionExamples).examples || []).map((ex, idx) => (
                      <div key={idx} className="admin-dashboard__drawer-item">
                        <div className="admin-dashboard__drawer-text">{ex.content}</div>
                        <div className="admin-dashboard__drawer-meta">{formatDateTime(ex.created_at)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {drawerType === 'knowledge-gap' && (
              <div className="admin-dashboard__drawer-stack">
                <div>
                  <h4 className="admin-dashboard__drawer-title">Question</h4>
                  <p className="admin-dashboard__drawer-text">
                    {(drawerData as KnowledgeGapDetail).question}
                  </p>
                </div>
                {(drawerData as KnowledgeGapDetail).reason && (
                  <div>
                    <h4 className="admin-dashboard__drawer-title">Reason</h4>
                    <p className="admin-dashboard__drawer-text">
                      {(drawerData as KnowledgeGapDetail).reason}
                    </p>
                  </div>
                )}
                <div>
                  <h4 className="admin-dashboard__drawer-title">Occurrences: {(drawerData as KnowledgeGapDetail).occurrences}</h4>
                </div>
                {((drawerData as KnowledgeGapDetail).examples || []).length > 0 && (
                  <div>
                    <h4 className="admin-dashboard__drawer-title">Examples</h4>
                    <div className="admin-dashboard__drawer-stack-sm">
                      {((drawerData as KnowledgeGapDetail).examples || []).map((ex, idx) => (
                        <div key={idx} className="admin-dashboard__drawer-item">
                          <div className="admin-dashboard__drawer-text">{ex.content}</div>
                          <div className="admin-dashboard__drawer-meta">{formatDateTime(ex.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {drawerType === 'ticket' && (
              <div className="admin-dashboard__drawer-stack">
                <div>
                  <h4 className="admin-dashboard__drawer-title">Status</h4>
                  <p className="admin-dashboard__drawer-text">
                    {(drawerData as ApiConversationDetail).conversation.status || 'open'}
                  </p>
                </div>
                {(drawerData as ApiConversationDetail).conversation.category && (
                  <div>
                    <h4 className="admin-dashboard__drawer-title">Kategorija</h4>
                    <p className="admin-dashboard__drawer-text">
                      {categoryDisplayLabel((drawerData as ApiConversationDetail).conversation.category)}
                    </p>
                  </div>
                )}
                <div>
                  <h4 className="admin-dashboard__drawer-title">
                    Messages ({((drawerData as ApiConversationDetail).messages || []).length})
                  </h4>
                  <div className="admin-dashboard__drawer-scroll">
                    {((drawerData as ApiConversationDetail).messages || []).map((msg) => (
                      <div
                        key={msg.id}
                        className={`admin-dashboard__drawer-item ${msg.role === 'user' ? 'admin-dashboard__drawer-item--user' : ''}`}
                      >
                        <div className="admin-dashboard__drawer-meta admin-dashboard__drawer-meta--strong">
                          {msg.role === 'user' ? 'User' : 'Assistant'}
                        </div>
                        <div className="admin-dashboard__drawer-text">{msg.content_redacted || '-'}</div>
                        <div className="admin-dashboard__drawer-meta">{formatDateTime(msg.created_at)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="admin-dashboard__drawer-state">No data available</div>
        )}
      </Drawer>
    </div>
  );
}
