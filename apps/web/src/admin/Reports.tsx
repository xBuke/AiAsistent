import { useCallback, useEffect, useMemo, useState } from 'react';

type ReportsRange = '7d' | '30d' | '365d';
type TicketStatus = 'open' | 'resolved' | 'closed' | string;

interface ReportsResponse {
  conversations_by_day: Array<{ date: string; count: number }>;
  ticket_stats: Array<{ status: TicketStatus; count: number }>;
  top_categories: Array<{ category: string; count: number }>;
  kpis: {
    total_conversations: number;
    total_messages: number;
    total_tickets: number;
    fallback_rate: number;
  };
}

const BASE = import.meta.env.PROD
  ? '/api'
  : ((import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'http://localhost:3000');

const defaultReports: ReportsResponse = {
  conversations_by_day: [],
  ticket_stats: [],
  top_categories: [],
  kpis: {
    total_conversations: 0,
    total_messages: 0,
    total_tickets: 0,
    fallback_rate: 0,
  },
};

const rangeLabels: Record<ReportsRange, string> = {
  '7d': '7D',
  '30d': '30 dana',
  '365d': 'Godišnje',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('hr-HR').format(value);
}

function formatAxisDate(date: string): string {
  const parsed = new Date(date);
  return parsed.toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
}

function mapTicketLabel(status: TicketStatus): string {
  if (status === 'open') return 'Otvoreni';
  if (status === 'resolved') return 'Riješeni';
  if (status === 'closed') return 'Zatvoreni';
  return status;
}

function buildCsv(report: ReportsResponse): string {
  const lines: string[] = [];
  lines.push('KPIs');
  lines.push('metrika,vrijednost');
  lines.push(`total_conversations,${report.kpis.total_conversations}`);
  lines.push(`total_messages,${report.kpis.total_messages}`);
  lines.push(`total_tickets,${report.kpis.total_tickets}`);
  lines.push(`fallback_rate,${report.kpis.fallback_rate}`);
  lines.push('');
  lines.push('Conversations by day');
  lines.push('date,count');
  report.conversations_by_day.forEach((row) => lines.push(`${row.date},${row.count}`));
  lines.push('');
  lines.push('Top categories');
  lines.push('category,count');
  report.top_categories.forEach((row) => lines.push(`"${row.category.replace(/"/g, '""')}",${row.count}`));
  lines.push('');
  lines.push('Ticket stats');
  lines.push('status,count');
  report.ticket_stats.forEach((row) => lines.push(`${row.status},${row.count}`));
  return lines.join('\n');
}

export function Reports() {
  const [range, setRange] = useState<ReportsRange>('30d');
  const [data, setData] = useState<ReportsResponse>(defaultReports);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ range });
      const res = await fetch(`${BASE}/admin/reports?${query.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Reports: ${res.status}`);
      }
      const payload = (await res.json()) as ReportsResponse;
      setData(payload);
    } catch {
      setError('Greška pri učitavanju izvještaja. Pokušajte ponovo.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const openTickets = useMemo(
    () => data.ticket_stats.find((item) => item.status === 'open')?.count ?? 0,
    [data.ticket_stats]
  );

  const maxConversationCount = useMemo(
    () => Math.max(...data.conversations_by_day.map((item) => item.count), 0),
    [data.conversations_by_day]
  );
  const yAxisTicks = useMemo(() => {
    if (maxConversationCount === 0) return [0, 1, 2, 3, 4];
    const step = Math.max(1, Math.ceil(maxConversationCount / 4));
    return [0, step, step * 2, step * 3, step * 4];
  }, [maxConversationCount]);

  const maxCategoryCount = useMemo(
    () => Math.max(...data.top_categories.map((item) => item.count), 1),
    [data.top_categories]
  );

  const totalTickets = useMemo(
    () => data.ticket_stats.reduce((sum, item) => sum + item.count, 0),
    [data.ticket_stats]
  );

  const handleExportCsv = () => {
    const csv = buildCsv(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `civis-izvjestaj-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const printDate = new Date().toLocaleDateString('hr-HR');
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        .reports-print-root, .reports-print-root * { visibility: visible !important; }
        .reports-print-root { position: absolute; left: 0; top: 0; width: 100%; padding-top: 60px !important; }
        .reports-print-header {
          visibility: visible !important;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          padding: 12px 20px;
          background: white;
          border-bottom: 1px solid #d1d5db;
          font-weight: 600;
          color: #111827;
        }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    const header = document.createElement('div');
    header.className = 'reports-print-header';
    header.textContent = `Civis — Izvještaj — ${printDate}`;
    document.body.appendChild(header);

    const cleanup = () => {
      style.remove();
      header.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  if (loading) {
    return (
      <div className="reports-print-root" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <style>{`
          @keyframes reportPulse {
            0% { opacity: 1; }
            50% { opacity: 0.45; }
            100% { opacity: 1; }
          }
        `}</style>
        {[1, 2, 3].map((row) => (
          <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {[1, 2, 3, 4].map((item) => (
              <div
                key={`${row}-${item}`}
                style={{
                  height: '92px',
                  borderRadius: '10px',
                  background: '#e5e7eb',
                  animation: 'reportPulse 1.1s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="reports-print-root" style={{ padding: '1rem', background: '#fff', borderRadius: '10px' }}>
        <p style={{ margin: '0 0 0.75rem', color: '#b91c1c', fontWeight: 500 }}>{error}</p>
        <button
          type="button"
          onClick={fetchReports}
          style={{
            padding: '0.5rem 1rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Pokušaj ponovo
        </button>
      </div>
    );
  }

  return (
    <div className="reports-print-root" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <section
        style={{
          background: '#fff',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          padding: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', color: '#111827' }}>Izvještaji</h1>
          <p style={{ margin: '0.35rem 0 0', color: '#6b7280' }}>Pregled aktivnosti i komunikacije s građanima</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', border: '1px solid #d1d5db', borderRadius: '999px', overflow: 'hidden' }}>
            {(Object.keys(rangeLabels) as ReportsRange[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                style={{
                  border: 'none',
                  background: option === range ? '#2563eb' : '#fff',
                  color: option === range ? '#fff' : '#374151',
                  padding: '0.4rem 0.85rem',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                }}
              >
                {rangeLabels[option]}
              </button>
            ))}
          </div>
          <button type="button" onClick={handleExportCsv} style={{ border: '1px solid #d1d5db', background: '#fff', padding: '0.45rem 0.8rem', borderRadius: '8px', cursor: 'pointer' }}>
            Izvoz CSV
          </button>
          <button type="button" onClick={handleExportPdf} style={{ border: '1px solid #d1d5db', background: '#fff', padding: '0.45rem 0.8rem', borderRadius: '8px', cursor: 'pointer' }}>
            Izvoz PDF
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {[
          ['Ukupno razgovora', formatNumber(data.kpis.total_conversations)],
          ['Ukupno poruka', formatNumber(data.kpis.total_messages)],
          ['Otvoreni ticketi', formatNumber(openTickets)],
          ['Stopa bez odgovora', `${data.kpis.fallback_rate}%`],
        ].map(([label, value]) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem' }}>
            <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>{label}</div>
            <div style={{ marginTop: '0.4rem', fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>{value}</div>
          </div>
        ))}
      </section>

      <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem' }}>
        <h3 style={{ margin: 0, marginBottom: '0.75rem', color: '#111827' }}>Razgovori po danu</h3>
        {data.conversations_by_day.length === 0 ? (
          <p style={{ margin: 0, color: '#6b7280' }}>Nema podataka za odabrano razdoblje</p>
        ) : (
          <svg width="100%" height="280" viewBox="0 0 860 280" style={{ display: 'block' }}>
            {yAxisTicks.map((tick, idx) => {
              const y = 20 + ((4 - idx) / 4) * 200;
              return (
                <g key={tick}>
                  <line x1="60" y1={y} x2="830" y2={y} stroke="#e5e7eb" strokeWidth="1" />
                  <text x="52" y={y + 4} textAnchor="end" fill="#6b7280" fontSize="11">
                    {tick}
                  </text>
                </g>
              );
            })}
            {data.conversations_by_day.map((point, idx) => {
              const availableWidth = 740;
              const slot = availableWidth / data.conversations_by_day.length;
              const barWidth = Math.max(12, slot - 10);
              const x = 70 + idx * slot;
              const barHeight = maxConversationCount > 0 ? (point.count / maxConversationCount) * 200 : 0;
              const y = 220 - barHeight;
              return (
                <g key={`${point.date}-${idx}`}>
                  <rect x={x} y={y} width={barWidth} height={barHeight} fill="#2563eb" rx="3" />
                  <text x={x + barWidth / 2} y="246" textAnchor="middle" fill="#6b7280" fontSize="10">
                    {formatAxisDate(point.date)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </section>

      <section style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.75rem', color: '#111827' }}>Top kategorije</h3>
          {data.top_categories.length === 0 ? (
            <p style={{ margin: 0, color: '#6b7280' }}>Nema kategoriziranih razgovora</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {data.top_categories.slice(0, 10).map((item) => (
                <div key={item.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                    <span style={{ color: '#111827' }}>{item.category}</span>
                    <span style={{ color: '#374151', fontWeight: 600 }}>{item.count}</span>
                  </div>
                  <div style={{ height: '9px', background: '#e5e7eb', borderRadius: '999px' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(item.count / maxCategoryCount) * 100}%`,
                        background: '#2563eb',
                        borderRadius: '999px',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: '300px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.75rem', color: '#111827' }}>Status tiketa</h3>
          {data.ticket_stats.length === 0 ? (
            <p style={{ margin: 0, color: '#6b7280' }}>Nema tiketa u odabranom razdoblju</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.ticket_stats.map((item) => {
                const percent = totalTickets > 0 ? Math.round((item.count / totalTickets) * 100) : 0;
                return (
                  <div
                    key={item.status}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.65rem',
                      background: '#f8fafc',
                      borderRadius: '999px',
                    }}
                  >
                    <span style={{ color: '#111827', fontSize: '0.86rem' }}>{mapTicketLabel(item.status)}</span>
                    <span style={{ color: '#374151', fontWeight: 600, fontSize: '0.86rem' }}>
                      {item.count} ({percent}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
