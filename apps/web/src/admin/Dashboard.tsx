import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { StatCard } from './components/StatCard';
import { LineChart } from './components/LineChart';
import { BarChart } from './components/BarChart';
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
import type { PeriodOption } from './components/TopHeader';
import './Dashboard.css';

const PREVIEW_TICKETS_COUNT = 5;
const PREVIEW_QUESTIONS_COUNT = 5;

interface DashboardProps {
  events: any[];
  period: PeriodOption;
  onPeriodChange: (period: PeriodOption) => void;
  liveEnabled: boolean;
  onLiveChange: (enabled: boolean) => void;
  onViewAllTickets?: () => void;
  onViewAllQuestions?: () => void;
}

const PERIOD_OPTIONS: PeriodOption[] = ['7D', 'Monthly', 'Yearly'];

export function Dashboard({
  events,
  period,
  onPeriodChange,
  liveEnabled,
  onLiveChange,
  onViewAllTickets,
  onViewAllQuestions,
}: DashboardProps) {
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
  const unresolvedKnowledgeGaps = useMemo(
    () =>
      (summary?.knowledge_gaps ?? [])
        .filter((gap) => gap.status !== 'resolved' && gap.status !== 'closed')
        .slice(0, 3),
    [summary]
  );

  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <div className="admin-dashboard__header-copy">
          <h1 className="admin-dashboard__title">Uvid u komunikaciju s građanima</h1>
          <p className="admin-dashboard__subtitle">
            Pregled trendova, upita i praznina znanja koje treba pokriti novim sadržajem.
          </p>
        </div>
        <div className="admin-dashboard__header-controls">
          <div className="admin-dashboard__period-group" role="group" aria-label="Razdoblje">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onPeriodChange(option);
                  setFilters((prev) => ({
                    ...prev,
                    dateRange: option === '7D' ? '7d' : option === 'Monthly' ? '30d' : '30d',
                  }));
                }}
                className={`admin-dashboard__period-btn ${period === option ? 'is-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>
          <label className="admin-dashboard__live-toggle">
            <input type="checkbox" checked={liveEnabled} onChange={(e) => onLiveChange(e.target.checked)} />
            <span>Live</span>
          </label>
        </div>
      </div>

      <div className="admin-dashboard__filters">
        <select
          className="admin-select admin-dashboard__filter-select"
          value={filters.category}
          onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
        >
          <option value="All">Sve kategorije</option>
          {categoriesFromSummary.map((cat) => (
            <option key={cat} value={cat}>
              {categoryDisplayLabel(cat)}
            </option>
          ))}
        </select>
        <input
          className="admin-input admin-dashboard__filter-input"
          placeholder="Pretraži po pitanju..."
          value={filters.searchQuery}
          onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
        />
      </div>

      {loading && (
        <div className="admin-dashboard__empty-state">
          <div className="admin-dashboard__empty-icon" aria-hidden="true">◌</div>
          <p>Učitavanje nadzorne ploče...</p>
        </div>
      )}

      {error && !loading && (
        <div className="admin-dashboard__error">Greška pri učitavanju: {error}</div>
      )}

      {!loading && !error && summary && (
        <>
          <div className="admin-dashboard__kpi-grid">
            <StatCard title="Ukupan broj razgovora" value={summary.kpis.conversations_total} />
            <StatCard title="Upiti za koje je potrebna reakcija Grada" value={summary.kpis.tickets_open} />
            <StatCard title="Najčešća tema razgovora" value={topCategoryLabel} />
            <StatCard title="Raspoloženje građana" value="Stabilno" />
          </div>

          <div className="admin-dashboard__charts-grid">
            <div className="admin-card admin-dashboard__chart-card">
              <h3 className="admin-dashboard__section-title">Pitanja po danu</h3>
              <div className="admin-dashboard__chart-content">
                <LineChart data={summary.charts.questions_per_day} width={560} height={220} />
              </div>
            </div>
            <div className="admin-card admin-dashboard__chart-card">
              <h3 className="admin-dashboard__section-title">Top kategorije</h3>
              <div className="admin-dashboard__chart-content">
                <BarChart
                  data={summary.charts.top_categories.map((c) => ({
                    category: categoryDisplayLabel(c.category),
                    count: c.count,
                  }))}
                  width={560}
                  height={220}
                />
              </div>
            </div>
          </div>

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
              <div className="admin-dashboard__empty-state admin-dashboard__empty-state--compact">
                <div className="admin-dashboard__empty-icon" aria-hidden="true">◌</div>
                <p>Nema dostupnih podataka za odabrano razdoblje.</p>
              </div>
            ) : (
              <ol className="admin-dashboard__ranked-list">
                {previewQuestions.map((q, idx) => (
                  <li
                    key={idx}
                    onClick={() => handleQuestionClick(q.question)}
                    className="admin-dashboard__ranked-item"
                  >
                    <span className="admin-dashboard__ranked-question" title={q.question}>{q.question}</span>
                    <span className="admin-dashboard__ranked-badge">{q.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="admin-dashboard__charts-grid">
            <div className="admin-card admin-dashboard__panel">
              <h3 className="admin-dashboard__section-title">Sažetak komunikacije – zadnjih 7 dana</h3>
              <p className="admin-dashboard__text">
                Većina upita odnosi se na komunalne teme i administrativne informacije. Dio upita zahtijeva daljnju obradu od strane gradske uprave.
              </p>
            </div>
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

          <div className="admin-card admin-dashboard__panel">
            <div className="admin-dashboard__panel-header">
              <h3 className="admin-dashboard__section-title">Knowledge gaps</h3>
              {onViewAllQuestions && (
                <button type="button" onClick={onViewAllQuestions} className="admin-dashboard__link-btn">
                  Vidi sve →
                </button>
              )}
            </div>
            {unresolvedKnowledgeGaps.length === 0 ? (
              <div className="admin-dashboard__empty-state admin-dashboard__empty-state--compact">
                <div className="admin-dashboard__empty-icon" aria-hidden="true">◌</div>
                <p>Trenutno nema neriješenih praznina znanja.</p>
              </div>
            ) : (
              <div className="admin-dashboard__list">
                {unresolvedKnowledgeGaps.map((gap) => (
                  <button
                    key={gap.id}
                    type="button"
                    className="admin-dashboard__list-item admin-dashboard__list-item--button"
                    onClick={() => handleKnowledgeGapClick(gap.id)}
                  >
                    <span className="admin-dashboard__list-item-title">{gap.question}</span>
                    <span className="admin-dashboard__list-item-count">{gap.count}x</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Drawer
        isOpen={drawerType !== null}
        onClose={closeDrawer}
        title={
          drawerType === 'question'
            ? 'Primjeri pitanja'
            : drawerType === 'knowledge-gap'
            ? 'Detalji praznine znanja'
            : 'Detalji ticketa'
        }
      >
        {drawerLoading ? (
          <div className="admin-dashboard__drawer-state">Učitavanje...</div>
        ) : drawerData ? (
          <>
            {drawerType === 'question' && (
              <div className="admin-dashboard__drawer-stack">
                <div>
                  <h4 className="admin-dashboard__drawer-title">Normalizirano pitanje</h4>
                  <p className="admin-dashboard__drawer-text">
                    {(drawerData as QuestionExamples).question}
                  </p>
                </div>
                <div>
                  <h4 className="admin-dashboard__drawer-title">
                    Primjeri ({((drawerData as QuestionExamples).examples || []).length})
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
                  <h4 className="admin-dashboard__drawer-title">Pitanje</h4>
                  <p className="admin-dashboard__drawer-text">
                    {(drawerData as KnowledgeGapDetail).question}
                  </p>
                </div>
                {(drawerData as KnowledgeGapDetail).reason && (
                  <div>
                    <h4 className="admin-dashboard__drawer-title">Razlog</h4>
                    <p className="admin-dashboard__drawer-text">
                      {(drawerData as KnowledgeGapDetail).reason}
                    </p>
                  </div>
                )}
                <div>
                  <h4 className="admin-dashboard__drawer-title">Ponavljanja: {(drawerData as KnowledgeGapDetail).occurrences}</h4>
                </div>
                {((drawerData as KnowledgeGapDetail).examples || []).length > 0 && (
                  <div>
                    <h4 className="admin-dashboard__drawer-title">Primjeri</h4>
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
                    Poruke ({((drawerData as ApiConversationDetail).messages || []).length})
                  </h4>
                  <div className="admin-dashboard__drawer-scroll">
                    {((drawerData as ApiConversationDetail).messages || []).map((msg) => (
                      <div
                        key={msg.id}
                        className={`admin-dashboard__drawer-item ${msg.role === 'user' ? 'admin-dashboard__drawer-item--user' : ''}`}
                      >
                        <div className="admin-dashboard__drawer-meta admin-dashboard__drawer-meta--strong">
                          {msg.role === 'user' ? 'Građanin' : 'Asistent'}
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
          <div className="admin-dashboard__drawer-state">Nema podataka za prikaz.</div>
        )}
      </Drawer>
    </div>
  );
}
