import { useMemo } from 'react';
import type { AnalyticsEvent } from '../analytics/types';
import type { FilterState } from './utils/analytics';
import { normalizeQuestion } from './utils/normalize';
import { exportAsJSON, exportAsCSV, exportEventsAsJSON, exportEventsAsCSV } from './utils/export';
import { getDateRangeStart } from './utils/analytics';
import { categoryDisplayLabel } from './utils/categories';

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
  question: string;
  sessionId: string;
  reason: 'fallback' | 'low_confidence';
  confidence?: string;
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
  const gaps: KnowledgeGap[] = [];

  events.forEach(event => {
    // Include all fallback events
    if (event.type === 'fallback') {
      gaps.push({
        id: event.id,
        timestamp: event.timestamp,
        question: event.question,
        sessionId: event.sessionId,
        reason: 'fallback',
      });
    }
    // Include low confidence questions if confidence exists
    else if (event.type === 'question' && event.confidence === 'low') {
      gaps.push({
        id: event.id,
        timestamp: event.timestamp,
        question: event.question,
        sessionId: event.sessionId,
        reason: 'low_confidence',
        confidence: event.confidence,
      });
    }
  });

  // Sort by timestamp (most recent first)
  return gaps.sort((a, b) => b.timestamp - a.timestamp);
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
      question: gap.question,
      reason: gap.reason,
      confidence: gap.confidence || '',
      session_id: gap.sessionId.substring(0, 8) + '...',
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Export Buttons */}
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={handleExportJSON}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#3b82f6';
          }}
        >
          Export JSON
        </button>
        <button
          onClick={handleExportCSV}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#059669';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#10b981';
          }}
        >
          Export CSV
        </button>
        <button
          onClick={handlePrintView}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#4b5563';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#6b7280';
          }}
        >
          Print View
        </button>
      </div>

      {/* D1: Top 20 Questions */}
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        }}
      >
        <h3
          style={{
            margin: '0 0 1rem 0',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          D1: Top 20 Questions
        </h3>
        {topQuestions.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No questions found</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Rank
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Normalized Question
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Count
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Sample Variants
                  </th>
                </tr>
              </thead>
              <tbody>
                {topQuestions.map((q, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#6b7280',
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#111827',
                        fontStyle: 'italic',
                      }}
                    >
                      {q.normalized}
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#3b82f6',
                        fontWeight: 600,
                      }}
                    >
                      {q.count}
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#6b7280',
                        fontSize: '0.8125rem',
                        maxWidth: '400px',
                        wordBreak: 'break-word',
                      }}
                    >
                      {q.samples.join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* D2: Trends */}
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        }}
      >
        <h3
          style={{
            margin: '0 0 1rem 0',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          D2: Trends
        </h3>
        
        <div style={{ marginBottom: '2rem' }}>
          <h4
            style={{
              margin: '0 0 0.75rem 0',
              fontSize: '1rem',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Questions per Day
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {trends.questionsPerDay.map((day, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#111827',
                      }}
                    >
                      {day.date}
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#3b82f6',
                        fontWeight: 600,
                      }}
                    >
                      {day.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4
            style={{
              margin: '0 0 0.75rem 0',
              fontSize: '1rem',
              fontWeight: 500,
              color: '#374151',
            }}
          >
            Top Categories
          </h4>
          {trends.topCategories.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No categories found</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.875rem',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '0.75rem 1rem',
                        fontWeight: 600,
                        color: '#374151',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Category
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '0.75rem 1rem',
                        fontWeight: 600,
                        color: '#374151',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trends.topCategories.map((cat, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          color: '#111827',
                        }}
                      >
                        {categoryDisplayLabel(cat.category)}
                      </td>
                      <td
                        style={{
                          padding: '0.75rem 1rem',
                          color: '#3b82f6',
                          fontWeight: 600,
                        }}
                      >
                        {cat.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* D3: Knowledge Gaps */}
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        }}
      >
        <h3
          style={{
            margin: '0 0 1rem 0',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          D3: Knowledge Gaps ({knowledgeGaps.length})
        </h3>
        {knowledgeGaps.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No knowledge gaps found</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Timestamp
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Question
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Reason
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: '#374151',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Session ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {knowledgeGaps.map((gap) => (
                  <tr
                    key={gap.id}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#6b7280',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {new Date(gap.timestamp).toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#111827',
                        maxWidth: '400px',
                        wordBreak: 'break-word',
                      }}
                    >
                      {gap.question}
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                      }}
                    >
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: gap.reason === 'fallback' ? '#fee2e2' : '#fef3c7',
                          color: gap.reason === 'fallback' ? '#991b1b' : '#92400e',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                        }}
                      >
                        {gap.reason === 'fallback' ? 'Fallback' : 'Low Confidence'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        color: '#6b7280',
                        fontFamily: 'monospace',
                        fontSize: '0.8125rem',
                      }}
                    >
                      {gap.sessionId.length > 12 ? `${gap.sessionId.substring(0, 12)}...` : gap.sessionId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
