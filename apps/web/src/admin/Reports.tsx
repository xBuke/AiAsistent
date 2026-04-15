import { useMemo, useState } from 'react';
import type { AnalyticsEvent } from '../analytics/types';
import type { FilterState } from './utils/analytics';
import { normalizeQuestion } from './utils/normalize';
import { exportAsJSON, exportAsCSV, exportEventsAsJSON, exportEventsAsCSV } from './utils/export';
import { getDateRangeStart } from './utils/analytics';
import { categoryDisplayLabel } from './utils/categories';
import './Reports.css';

interface ReportsProps {
  events: AnalyticsEvent[];
  filters: FilterState;
}

interface TopQuestion {
  normalized: string;
  count: number;
  samples: string[];
}

interface TrendData {
  questionsPerDay: Array<{ date: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
}

interface KnowledgeGap {
  id: string;
  timestamp: number;
  firstSeen: number;
  question: string;
  category: string;
  frequency: number;
  reason: 'fallback' | 'low_confidence';
  status: 'open' | 'resolved';
}

/**
 * Get top 20 questions grouped by normalized text
 */
function getTopQuestions(events: AnalyticsEvent[]): TopQuestion[] {
  const questionEvents = events.filter(e => e.type === 'question');
  const grouped = new Map<string, { count: number; samples: Set<string> }>();

  questionEvents.forEach(event => {
    const normalized = normalizeQuestion(event.question);
    const existing = grouped.get(normalized);
    
    if (existing) {
      existing.count++;
      // Keep up to 5 sample variants
      if (existing.samples.size < 5) {
        existing.samples.add(event.question);
      }
    } else {
      grouped.set(normalized, {
        count: 1,
        samples: new Set([event.question]),
      });
    }
  });

  return Array.from(grouped.entries())
    .map(([normalized, data]) => ({
      normalized,
      count: data.count,
      samples: Array.from(data.samples),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

/**
 * Get trends data (questions per day and top categories) within selected range
 */
function getTrends(events: AnalyticsEvent[], filters: FilterState): TrendData {
  const startTime = getDateRangeStart(filters.dateRange);
  const filtered = events.filter(e => e.timestamp >= startTime && e.type === 'question');
  
  // Questions per day
  const questionsPerDay: Array<{ date: string; count: number }> = [];
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const days = filters.dateRange === '24h' ? 1 : filters.dateRange === '7d' ? 7 : 30;
  
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = now - (i * oneDay);
    const dayEnd = dayStart + oneDay;
    const dateStr = new Date(dayStart).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      ...(days > 7 ? { year: 'numeric' } : {})
    });
    
    const count = filtered.filter(
      e => e.timestamp >= dayStart && e.timestamp < dayEnd
    ).length;
    
    questionsPerDay.push({ date: dateStr, count });
  }

  // Top categories
  const categoryCounts = new Map<string, number>();
  filtered.forEach(q => {
    if (q.category) {
      categoryCounts.set(q.category, (categoryCounts.get(q.category) || 0) + 1);
    }
  });

  const topCategories = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { questionsPerDay, topCategories };
}

/**
 * Get knowledge gaps (fallbacks + low confidence questions)
 */
function getKnowledgeGaps(events: AnalyticsEvent[]): KnowledgeGap[] {
  const grouped = new Map<string, KnowledgeGap>();
  events.forEach(event => {
    const isGap = event.type === 'fallback' || (event.type === 'question' && event.confidence === 'low');
    if (!isGap) return;
    const normalized = normalizeQuestion(event.question);
    const category = event.category ? categoryDisplayLabel(event.category) : 'Općenito';
    const existing = grouped.get(normalized);
    if (existing) {
      existing.frequency += 1;
      if (event.timestamp > existing.timestamp) {
        existing.timestamp = event.timestamp;
      }
      if (event.timestamp < existing.firstSeen) {
        existing.firstSeen = event.timestamp;
      }
      return;
    }

    grouped.set(normalized, {
      id: event.id,
      timestamp: event.timestamp,
      firstSeen: event.timestamp,
      question: event.question,
      category,
      frequency: 1,
      reason: event.type === 'fallback' ? 'fallback' : 'low_confidence',
      status: 'open',
    });
  });

  return Array.from(grouped.values()).sort((a, b) => b.frequency - a.frequency || b.timestamp - a.timestamp);
}

/**
 * Open print view in new window
 */
function openPrintView(reports: {
  topQuestions: TopQuestion[];
  trends: TrendData;
  knowledgeGaps: KnowledgeGap[];
  filters: FilterState;
  totalEvents: number;
}): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Admin Reports - Print View</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      color: #111827;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      color: #111827;
    }
    .meta {
      color: #6b7280;
      font-size: 0.875rem;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    h2 {
      font-size: 1.5rem;
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: #111827;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 0.5rem;
    }
    h3 {
      font-size: 1.125rem;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      color: #374151;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1.5rem;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background-color: #f9fafb;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #374151;
    }
    .count {
      font-weight: 600;
      color: #3b82f6;
    }
    .samples {
      font-size: 0.875rem;
      color: #6b7280;
      font-style: italic;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge-fallback {
      background-color: #fee2e2;
      color: #991b1b;
    }
    .badge-low-confidence {
      background-color: #fef3c7;
      color: #92400e;
    }
    @media print {
      body {
        padding: 1rem;
      }
      h2 {
        page-break-after: avoid;
      }
      table {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <h1>Admin Reports</h1>
  <div class="meta">
    Generated: ${new Date().toLocaleString()}<br>
    Date Range: ${reports.filters.dateRange}<br>
    Kategorija: ${reports.filters.category === 'All' ? 'Sve' : categoryDisplayLabel(reports.filters.category)}<br>
    Total Events: ${reports.totalEvents}
  </div>

  <h2>D1: Top 20 Questions</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Normalized Question</th>
        <th>Count</th>
        <th>Sample Variants</th>
      </tr>
    </thead>
    <tbody>
      ${reports.topQuestions.map((q, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${q.normalized}</td>
          <td class="count">${q.count}</td>
          <td class="samples">${q.samples.join('; ')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>D2: Trends</h2>
  
  <h3>Questions per Day</h3>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Count</th>
      </tr>
    </thead>
    <tbody>
      ${reports.trends.questionsPerDay.map(day => `
        <tr>
          <td>${day.date}</td>
          <td class="count">${day.count}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h3>Top Categories</h3>
  ${reports.trends.topCategories.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        ${reports.trends.topCategories.map(cat => `
          <tr>
            <td>${categoryDisplayLabel(cat.category)}</td>
            <td class="count">${cat.count}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p>No categories found</p>'}

  <h2>D3: Knowledge Gaps</h2>
  <p><strong>Total Gaps: ${reports.knowledgeGaps.length}</strong></p>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Question</th>
        <th>Reason</th>
        <th>Session ID</th>
      </tr>
    </thead>
    <tbody>
      ${reports.knowledgeGaps.map(gap => `
        <tr>
          <td>${new Date(gap.timestamp).toLocaleString()}</td>
          <td>${gap.question}</td>
          <td>
            <span class="badge badge-${gap.reason === 'fallback' ? 'fallback' : 'low-confidence'}">
              ${gap.reason === 'fallback' ? 'Fallback' : 'Low Confidence'}
            </span>
          </td>
          <td style="font-family: monospace; font-size: 0.8125rem;">${gap.sessionId.substring(0, 12)}...</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  
  // Wait for content to load, then trigger print
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

export function Reports({ events, filters }: ReportsProps) {
  const topQuestions = useMemo(() => getTopQuestions(events), [events]);
  const trends = useMemo(() => getTrends(events, filters), [events, filters]);
  const knowledgeGaps = useMemo(() => getKnowledgeGaps(events), [events]);
  const [resolvedGapIds, setResolvedGapIds] = useState<Set<string>>(new Set());

  const handleExportJSON = () => {
    const reportData = {
      generated: new Date().toISOString(),
      filters,
      topQuestions,
      trends,
      knowledgeGaps,
      summary: {
        totalEvents: events.length,
        topQuestionsCount: topQuestions.length,
        knowledgeGapsCount: knowledgeGaps.length,
      },
    };
    exportAsJSON(reportData, `reports-${new Date().toISOString().split('T')[0]}.json`);
  };

  const handleExportCSV = () => {
    // Export top questions as CSV
    const topQuestionsCSV = topQuestions.map((q, idx) => ({
      rank: idx + 1,
      normalized_question: q.normalized,
      count: q.count,
      sample_variants: q.samples.join('; '),
    }));
    exportAsCSV(topQuestionsCSV, `top-questions-${new Date().toISOString().split('T')[0]}.csv`);

    // Also export knowledge gaps
    const gapsCSV = knowledgeGaps.map(gap => ({
      timestamp: new Date(gap.timestamp).toISOString(),
      first_seen: new Date(gap.firstSeen).toISOString(),
      question: gap.question,
      category: gap.category,
      frequency: gap.frequency,
      reason: gap.reason,
      status: gap.status,
    }));
    exportAsCSV(gapsCSV, `knowledge-gaps-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handlePrintView = () => {
    openPrintView({
      topQuestions,
      trends,
      knowledgeGaps,
      filters,
      totalEvents: events.length,
    });
  };

  const groupedKnowledgeGaps = useMemo(() => {
    const grouped = new Map<string, KnowledgeGap[]>();
    knowledgeGaps.forEach((gap) => {
      const key = gap.category || 'Općenito';
      const list = grouped.get(key) ?? [];
      list.push(gap);
      grouped.set(key, list);
    });
    return Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [knowledgeGaps]);

  return (
    <div className="admin-reports">
      <div className="admin-reports__toolbar admin-card">
        <h1 className="admin-reports__title">Što građani ne mogu pronaći</h1>
        <div className="admin-reports__toolbar-actions">
          <button onClick={handleExportJSON} className="admin-btn-primary">Izvoz JSON</button>
          <button onClick={handleExportCSV} className="admin-btn-secondary">Izvoz CSV</button>
          <button onClick={handlePrintView} className="admin-btn-secondary">Ispis</button>
        </div>
      </div>

      <div className="admin-card admin-reports__section">
        <h3 className="admin-reports__section-title">Najčešća pitanja</h3>
        {topQuestions.length === 0 ? (
          <div className="admin-reports__empty">
            <span className="admin-reports__empty-icon" aria-hidden="true">◌</span>
            <p>Nema pronađenih pitanja.</p>
          </div>
        ) : (
          <div className="admin-reports__table-wrap">
            <table className="admin-reports__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Normalizirano pitanje</th>
                  <th>Broj</th>
                  <th>Varijante</th>
                </tr>
              </thead>
              <tbody>
                {topQuestions.map((q, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td><em>{q.normalized}</em></td>
                    <td><span className="admin-reports__count">{q.count}</span></td>
                    <td>{q.samples.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-card admin-reports__section">
        <h3 className="admin-reports__section-title">Trendovi</h3>
        <div className="admin-reports__subsection">
          <h4 className="admin-reports__subheading">Pitanja po danu</h4>
          <div className="admin-reports__table-wrap">
            <table className="admin-reports__table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Broj</th>
                </tr>
              </thead>
              <tbody>
                {trends.questionsPerDay.map((day, idx) => (
                  <tr key={idx}>
                    <td>{day.date}</td>
                    <td><span className="admin-reports__count">{day.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-reports__subsection">
          <h4 className="admin-reports__subheading">Top kategorije</h4>
          {trends.topCategories.length === 0 ? (
            <div className="admin-reports__empty admin-reports__empty--compact">
              <span className="admin-reports__empty-icon" aria-hidden="true">◌</span>
              <p>Nema kategorija za odabrano razdoblje.</p>
            </div>
          ) : (
            <div className="admin-reports__table-wrap">
              <table className="admin-reports__table">
                <thead>
                  <tr>
                    <th>Kategorija</th>
                    <th>Broj</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.topCategories.map((cat, idx) => (
                    <tr key={idx}>
                      <td>{categoryDisplayLabel(cat.category)}</td>
                      <td><span className="admin-reports__count">{cat.count}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="admin-card admin-reports__section">
        <h3 className="admin-reports__section-title">Praznine znanja ({knowledgeGaps.length})</h3>
        {knowledgeGaps.length === 0 ? (
          <div className="admin-reports__empty">
            <span className="admin-reports__empty-icon" aria-hidden="true">◌</span>
            <p>Nema zabilježenih praznina znanja.</p>
          </div>
        ) : (
          <div className="admin-reports__gaps">
            {groupedKnowledgeGaps.map(([category, gaps]) => {
              const content = (
                <div className="admin-reports__gap-list">
                  {gaps.map((gap) => {
                    const isResolved = resolvedGapIds.has(gap.id) || gap.status === 'resolved';
                    return (
                      <div key={gap.id} className={`admin-reports__gap-row ${isResolved ? 'is-resolved' : ''}`}>
                        <div className="admin-reports__gap-main">
                          <p className="admin-reports__gap-question">{gap.question}</p>
                          <p className="admin-reports__gap-meta">
                            Zadnje viđeno: {new Date(gap.timestamp).toLocaleDateString('hr-HR')}
                          </p>
                        </div>
                        <div className="admin-reports__gap-actions">
                          <span className="admin-reports__gap-badge">{gap.frequency}</span>
                          <button
                            type="button"
                            className="admin-btn-secondary admin-reports__resolve-btn"
                            disabled={isResolved}
                            onClick={() => {
                              if (isResolved) return;
                              setResolvedGapIds((prev) => new Set(prev).add(gap.id));
                            }}
                          >
                            {isResolved ? 'Riješeno' : 'Označi kao riješeno'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );

              if (gaps.length >= 5) {
                return (
                  <details key={category} className="admin-reports__category" open>
                    <summary>{category} ({gaps.length})</summary>
                    {content}
                  </details>
                );
              }

              return (
                <section key={category} className="admin-reports__category">
                  <h4>{category} ({gaps.length})</h4>
                  {content}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
