import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SentimentStats } from './api/adminClient';

interface SentimentMapProps {
  cityId: string;
  adminClient: {
    getSentimentStats: (days: number) => Promise<SentimentStats>;
    triggerBackfill: () => Promise<{ processed: number; failed: number }>;
  };
}

function truncateCategory(input: string): string {
  if (input.length <= 20) return input;
  return `${input.slice(0, 20)}…`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function scoreToY(score: number, minY: number, maxY: number): number {
  const clamped = Math.max(-1, Math.min(1, score));
  const normalized = (1 - clamped) / 2;
  return minY + normalized * (maxY - minY);
}

export function SentimentMap({ cityId, adminClient }: SentimentMapProps) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [stats, setStats] = useState<SentimentStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminClient.getSentimentStats(days);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri učitavanju sentiment statistike.');
    } finally {
      setLoading(false);
    }
  }, [adminClient, days]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handleBackfill = useCallback(async () => {
    setIsBackfilling(true);
    setError(null);
    try {
      await adminClient.triggerBackfill();
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri pokretanju analize sentimenta.');
    } finally {
      setIsBackfilling(false);
    }
  }, [adminClient, loadStats]);

  const overall = useMemo(() => {
    const base = stats?.overall ?? { positive: 0, neutral: 0, negative: 0, avgScore: 0 };
    const total = base.positive + base.neutral + base.negative;
    const positivePct = total > 0 ? (base.positive / total) * 100 : 0;
    const neutralPct = total > 0 ? (base.neutral / total) * 100 : 0;
    const negativePct = total > 0 ? (base.negative / total) * 100 : 0;
    return { ...base, total, positivePct, neutralPct, negativePct };
  }, [stats]);

  const byCategory = stats?.byCategory ?? [];
  const trend = stats?.trend ?? [];

  const rowHeight = 38;
  const chartWidth = 900;
  const labelColWidth = 210;
  const barsWidth = chartWidth - labelColWidth - 30;
  const chartHeight = Math.max(180, byCategory.length * rowHeight + 52);

  const trendWidth = 900;
  const trendHeight = 260;
  const trendPadding = { top: 28, right: 24, bottom: 36, left: 44 };
  const trendInnerWidth = trendWidth - trendPadding.left - trendPadding.right;
  const trendInnerHeight = trendHeight - trendPadding.top - trendPadding.bottom;

  const trendPath = useMemo(() => {
    if (trend.length === 0) return '';
    if (trend.length === 1) {
      const y = scoreToY(trend[0].avgScore, trendPadding.top, trendPadding.top + trendInnerHeight);
      return `M ${trendPadding.left} ${y}`;
    }

    return trend
      .map((point, index) => {
        const x = trendPadding.left + (index / (trend.length - 1)) * trendInnerWidth;
        const y = scoreToY(point.avgScore, trendPadding.top, trendPadding.top + trendInnerHeight);
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [trend, trendInnerHeight, trendInnerWidth, trendPadding.left, trendPadding.top]);

  return (
    <div
      style={{
        marginTop: '1.5rem',
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '0.75rem',
        padding: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        <h3 style={{ margin: 0, color: '#111827', fontSize: '1.1rem' }}>
          Raspoloženje građana
          <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
            ({cityId.toUpperCase()})
          </span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[7, 30, 90].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option as 7 | 30 | 90)}
              style={{
                border: '1px solid #d1d5db',
                backgroundColor: days === option ? '#111827' : '#ffffff',
                color: days === option ? '#ffffff' : '#111827',
                borderRadius: '999px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {option}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => void handleBackfill()}
            disabled={isBackfilling}
            style={{
              border: 'none',
              backgroundColor: isBackfilling ? '#9ca3af' : '#2563eb',
              color: '#ffffff',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.9rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: isBackfilling ? 'not-allowed' : 'pointer',
            }}
          >
            {isBackfilling ? '⏳ Analiziram...' : 'Osvježi analizu'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.65rem 0.8rem',
            borderRadius: '0.5rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            fontSize: '0.86rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          { label: 'Pozitivno', value: formatPercent(overall.positivePct), color: '#16a34a' },
          { label: 'Neutralno', value: formatPercent(overall.neutralPct), color: '#6b7280' },
          { label: 'Negativno', value: formatPercent(overall.negativePct), color: '#dc2626' },
          { label: 'Prosječni score', value: overall.avgScore.toFixed(3), color: '#1d4ed8' },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '0.65rem',
              padding: '0.7rem 0.75rem',
              backgroundColor: '#ffffff',
            }}
          >
            <div style={{ fontSize: '0.76rem', color: '#6b7280', marginBottom: '0.2rem' }}>{item.label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.65rem', padding: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#111827', marginBottom: '0.65rem' }}>
          Sentiment po kategorijama
        </div>
        {loading ? (
          <div style={{ color: '#6b7280', fontSize: '0.86rem' }}>Učitavanje...</div>
        ) : byCategory.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: '0.86rem' }}>Nema podataka za prikaz.</div>
        ) : (
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            width="100%"
            height="auto"
            role="img"
            aria-label="Sentiment stacked bar chart"
          >
            <line x1={labelColWidth} y1={24} x2={labelColWidth} y2={chartHeight - 22} stroke="#d1d5db" />
            <line x1={labelColWidth} y1={chartHeight - 22} x2={chartWidth - 20} y2={chartHeight - 22} stroke="#d1d5db" />
            {[0, 25, 50, 75, 100].map((tick) => {
              const x = labelColWidth + (tick / 100) * barsWidth;
              return (
                <g key={tick}>
                  <line x1={x} y1={24} x2={x} y2={chartHeight - 22} stroke="#f3f4f6" />
                  <text x={x} y={chartHeight - 7} textAnchor="middle" fill="#6b7280" fontSize="11">
                    {tick}%
                  </text>
                </g>
              );
            })}
            {byCategory.map((item, index) => {
              const y = 28 + index * rowHeight;
              const total = item.total || 1;
              const positiveWidth = (item.positive / total) * barsWidth;
              const neutralWidth = (item.neutral / total) * barsWidth;
              const negativeWidth = (item.negative / total) * barsWidth;
              const categoryUrl = `/conversations?category=${encodeURIComponent(item.category)}`;
              return (
                <g key={item.category}>
                  <text x={8} y={y + 14} fill="#111827" fontSize="12">
                    {truncateCategory(item.category)}
                  </text>
                  <rect
                    x={labelColWidth}
                    y={y}
                    width={positiveWidth}
                    height={16}
                    fill="#16a34a"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      window.location.href = categoryUrl;
                    }}
                  />
                  <rect
                    x={labelColWidth + positiveWidth}
                    y={y}
                    width={neutralWidth}
                    height={16}
                    fill="#6b7280"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      window.location.href = categoryUrl;
                    }}
                  />
                  <rect
                    x={labelColWidth + positiveWidth + neutralWidth}
                    y={y}
                    width={negativeWidth}
                    height={16}
                    fill="#dc2626"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      window.location.href = categoryUrl;
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.65rem', padding: '0.75rem' }}>
        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#111827', marginBottom: '0.65rem' }}>
          Trend sentiment score (zadnjih 8 tjedana)
        </div>
        {trend.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: '0.86rem' }}>Nema trend podataka.</div>
        ) : (
          <svg
            viewBox={`0 0 ${trendWidth} ${trendHeight}`}
            width="100%"
            height="auto"
            role="img"
            aria-label="Weekly sentiment score trend line chart"
          >
            {[-1, -0.5, 0, 0.5, 1].map((tick) => {
              const y = scoreToY(tick, trendPadding.top, trendPadding.top + trendInnerHeight);
              return (
                <g key={tick}>
                  <line
                    x1={trendPadding.left}
                    y1={y}
                    x2={trendWidth - trendPadding.right}
                    y2={y}
                    stroke={tick === 0 ? '#d1d5db' : '#f3f4f6'}
                  />
                  <text x={trendPadding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#6b7280">
                    {tick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {trend.length > 1 &&
              trend.map((point, index) => {
                const x =
                  trendPadding.left + (index / (trend.length - 1)) * trendInnerWidth;
                return (
                  <text
                    key={point.week}
                    x={x}
                    y={trendHeight - 10}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#6b7280"
                  >
                    {point.week.slice(5)}
                  </text>
                );
              })}

            <path d={trendPath} stroke="#2563eb" strokeWidth={2.5} fill="none" />
            {trend.map((point, index) => {
              const x =
                trend.length > 1
                  ? trendPadding.left + (index / (trend.length - 1)) * trendInnerWidth
                  : trendPadding.left;
              const y = scoreToY(point.avgScore, trendPadding.top, trendPadding.top + trendInnerHeight);
              return <circle key={`dot-${point.week}`} cx={x} cy={y} r={3.5} fill="#2563eb" />;
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
