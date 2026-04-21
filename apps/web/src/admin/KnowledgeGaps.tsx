import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lightbulb, RefreshCw, Search, X } from 'lucide-react';
import {
  categorizeKnowledgeGaps,
  fetchKnowledgeGapDetail,
  fetchKnowledgeGaps,
  fetchKnowledgeGapSuggestions,
  type KnowledgeGapDetail,
  type KnowledgeGapListItem,
  type KnowledgeGapSuggestion,
} from './api/adminClient';

type RangeOption = '7d' | '30d' | '365d';

const RANGE_BUTTONS: Array<{ label: string; value: RangeOption }> = [
  { label: '7D', value: '7d' },
  { label: 'Mjesečno', value: '30d' },
  { label: 'Godišnje', value: '365d' },
];

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    border-radius: 6px;
    background: #10b981;
    color: #fff;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 2000);
}

const formatCroatianDate = (dateString: string) => {
  const date = new Date(dateString);
  const months = [
    'siječnja',
    'veljače',
    'ožujka',
    'travnja',
    'svibnja',
    'lipnja',
    'srpnja',
    'kolovoza',
    'rujna',
    'listopada',
    'studenog',
    'prosinca',
  ];
  return `${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}.`;
};

function toCroatianLongDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return formatCroatianDate(value);
}

function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}

export function KnowledgeGaps() {
  const [range, setRange] = useState<RangeOption>('7d');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [gaps, setGaps] = useState<KnowledgeGapListItem[]>([]);
  const [loadingGaps, setLoadingGaps] = useState(true);

  const [categorizing, setCategorizing] = useState(false);

  const [suggestions, setSuggestions] = useState<KnowledgeGapSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [suggestionsVisible, setSuggestionsVisible] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerDetail, setDrawerDetail] = useState<KnowledgeGapDetail | null>(null);

  const loadGaps = useCallback(async () => {
    setLoadingGaps(true);
    try {
      const data = await fetchKnowledgeGaps({ range });
      setGaps(data);
    } catch {
      setGaps([]);
    } finally {
      setLoadingGaps(false);
    }
  }, [range]);

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const data = await fetchKnowledgeGapSuggestions();
      if (Array.isArray(data) && data.length > 0) {
        setSuggestions(data.slice(0, 3));
        setSuggestionsVisible(true);
      } else {
        setSuggestions([]);
        setSuggestionsVisible(false);
      }
    } catch {
      setSuggestions([]);
      setSuggestionsVisible(false);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const handleCategorize = useCallback(async () => {
    setCategorizing(true);
    try {
      await categorizeKnowledgeGaps();
      showToast('Kategorizacija završena');
      await loadGaps();
      await loadSuggestions();
    } finally {
      setCategorizing(false);
    }
  }, [loadGaps, loadSuggestions]);

  const uniqueCategories = useMemo(() => {
    const values = new Set<string>();
    gaps.forEach((gap) => {
      if (gap.category && gap.category.trim()) {
        values.add(gap.category.trim());
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'hr'));
  }, [gaps]);

  const filteredGaps = useMemo(() => {
    return gaps.filter((gap) => {
      const matchesSearch = gap.question.toLowerCase().includes(search.toLowerCase());
      const normalizedCategory = gap.category?.trim() || null;
      const matchesCategory = categoryFilter === 'all' ? true : normalizedCategory === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [gaps, search, categoryFilter]);

  const groupedGaps = useMemo(() => {
    const grouped = new Map<string, KnowledgeGapListItem[]>();
    filteredGaps.forEach((gap) => {
      const categoryKey = gap.category?.trim() || 'Nekategorizirano';
      if (!grouped.has(categoryKey)) {
        grouped.set(categoryKey, []);
      }
      grouped.get(categoryKey)?.push(gap);
    });

    const entries = Array.from(grouped.entries())
      .filter(([category]) => category !== 'Nekategorizirano')
      .sort((a, b) => a[0].localeCompare(b[0], 'hr'));

    if (grouped.has('Nekategorizirano')) {
      entries.push(['Nekategorizirano', grouped.get('Nekategorizirano') || []]);
    }
    return entries;
  }, [filteredGaps]);

  const totalQuestions = gaps.reduce((acc, gap) => acc + (gap.count || 0), 0);
  const noAnswerToday = gaps.filter((gap) => isToday(gap.last_seen_at)).length;
  const uncategorizedCount = gaps.filter((gap) => !gap.category).length;

  const openDetail = useCallback(async (id: string) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerDetail(null);
    try {
      const detail = await fetchKnowledgeGapDetail(id);
      setDrawerDetail(detail);
    } catch {
      setDrawerDetail(null);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Knowledge Gaps</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
            Pitanja građana na koja asistent nije mogao odgovoriti
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCategorize}
            disabled={categorizing}
            style={{
              padding: '8px 16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: categorizing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              opacity: categorizing ? 0.7 : 1,
            }}
          >
            {categorizing ? <RefreshCw style={{ width: '16px', height: '16px', marginRight: '8px' }} /> : null}
            Analiziraj kategorije
          </button>
          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
            {RANGE_BUTTONS.map((option) =>
              range === option.value ? (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  style={{
                    padding: '6px 12px',
                    background: '#2563eb',
                    color: '#fff',
                    border: '1px solid #2563eb',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {option.label}
                </button>
              ) : (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    color: '#6b7280',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {option.label}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {(loadingSuggestions || suggestionsVisible) && (
        <section style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {loadingSuggestions
            ? Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  style={{ flex: '1 1 280px', padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}
                >
                  <div style={{ marginBottom: '8px', height: '16px', width: '66%', borderRadius: '4px', background: '#dbeafe' }} />
                  <div style={{ marginBottom: '8px', height: '12px', width: '33%', borderRadius: '4px', background: '#dbeafe' }} />
                  <div style={{ height: '12px', width: '100%', borderRadius: '4px', background: '#dbeafe' }} />
                </div>
              ))
            : suggestions.map((item, idx) => (
                <article
                  key={`${item.category}-${idx}`}
                  style={{ flex: '1 1 280px', padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <p style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>{item.category}</p>
                    <Lightbulb style={{ width: '16px', height: '16px', color: '#f59e0b' }} />
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, marginBottom: '8px' }}>{item.count} upita</p>
                  <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>{item.suggestion}</p>
                </article>
              ))}
        </section>
      )}

      <section style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px', padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>Ukupno pitanja</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827', margin: 0 }}>{totalQuestions}</p>
        </div>
        <div style={{ flex: '1 1 150px', padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>Bez odgovora danas</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827', margin: 0 }}>{noAnswerToday}</p>
        </div>
        <div style={{ flex: '1 1 150px', padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>Nekategorizirano</p>
          <p style={{ fontSize: '28px', fontWeight: 700, color: '#111827', margin: 0 }}>{uncategorizedCount}</p>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ position: 'relative', display: 'block' }}>
            <Search
              style={{
                pointerEvents: 'none',
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                color: '#9ca3af',
              }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pretraži pitanja..."
              style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', width: '280px', paddingLeft: '34px' }}
            />
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
          >
            <option value="all">Sve kategorije</option>
            {uniqueCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {loadingGaps ? (
          <div>
            {Array.from({ length: 3 }).map((_, groupIdx) => (
              <div key={groupIdx} style={{ marginBottom: '20px' }}>
                <div style={{ height: '20px', width: '160px', borderRadius: '4px', background: '#e5e7eb', marginBottom: '12px' }} />
                {Array.from({ length: 2 }).map((__, cardIdx) => (
                  <div
                    key={cardIdx}
                    style={{ padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '8px' }}
                  >
                    <div style={{ marginBottom: '8px', height: '14px', width: '80%', borderRadius: '4px', background: '#e5e7eb' }} />
                    <div style={{ height: '13px', width: '50%', borderRadius: '4px', background: '#e5e7eb' }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : groupedGaps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: '#6b7280' }}>
            <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>Nema evidentiranih praznina znanja</div>
            <p style={{ margin: 0 }}>
              Pitanja na koja asistent ne zna odgovoriti pojavit će se ovdje
            </p>
          </div>
        ) : (
          <div>
            {groupedGaps.map(([category, items]) => (
              <div key={category} style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', marginTop: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>{category}</h3>
                  <span style={{ padding: '2px 8px', background: '#e5e7eb', borderRadius: '12px', fontSize: '12px', color: '#374151' }}>
                    {items.length}
                  </span>
                </div>
                <div>
                  {items.map((gap) => (
                    <article
                      key={gap.id}
                      style={{ padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '8px' }}
                    >
                      <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', marginTop: 0 }}>{gap.question}</p>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px', color: '#6b7280', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px', color: '#6b7280' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw style={{ width: '14px', height: '14px' }} />
                            {gap.count}
                          </span>
                          <span>{toCroatianLongDate(gap.last_seen_at)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDetail(gap.id)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: '#2563eb',
                            background: 'transparent',
                            border: '1px solid #2563eb',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Vidi razgovor
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} onClick={() => setDrawerOpen(false)} />
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              height: '100%',
              width: '480px',
              background: '#fff',
              zIndex: 51,
              padding: '24px',
              overflowY: 'auto',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
              maxWidth: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', marginTop: 0 }}>Detalji praznine znanja</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', padding: '4px' }}
                aria-label="Zatvori"
              >
                <X style={{ width: '20px', height: '20px' }} />
              </button>
            </div>
            <div>
              {drawerLoading ? (
                <div>
                  <div style={{ height: '20px', width: '66%', borderRadius: '4px', background: '#e5e7eb', marginBottom: '12px' }} />
                  <div style={{ height: '16px', width: '100%', borderRadius: '4px', background: '#e5e7eb', marginBottom: '12px' }} />
                  <div style={{ height: '16px', width: '83%', borderRadius: '4px', background: '#e5e7eb' }} />
                </div>
              ) : !drawerDetail ? (
                <p style={{ textAlign: 'center', padding: '64px 24px', color: '#6b7280', margin: 0 }}>
                  Nema podataka za prikaz.
                </p>
              ) : (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>Pitanje</p>
                    <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: 0, marginTop: 0 }}>{drawerDetail.question}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px', color: '#6b7280', flexWrap: 'wrap', marginBottom: '20px' }}>
                    {drawerDetail.status === 'resolved' ? (
                      <span style={{ padding: '2px 8px', background: '#d1fae5', color: '#065f46', borderRadius: '12px', fontSize: '12px' }}>
                        resolved
                      </span>
                    ) : (
                      <span style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '12px', fontSize: '12px' }}>
                        open
                      </span>
                    )}
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                      Prvo viđeno: {toCroatianLongDate(drawerDetail.first_seen_at)}
                    </span>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                      Zadnje viđeno: {toCroatianLongDate(drawerDetail.last_seen_at)}
                    </span>
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', marginTop: 0 }}>Primjeri poruka</p>
                    {(drawerDetail.examples || []).length === 0 ? (
                      <p style={{ textAlign: 'center', padding: '64px 24px', color: '#6b7280', margin: 0 }}>Nema dostupnih primjera.</p>
                    ) : (
                      <div>
                        {drawerDetail.examples.map((example, idx) => (
                          <div
                            key={`${example.conversation_id}-${idx}`}
                            style={{ padding: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '8px' }}
                          >
                            <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', marginTop: 0 }}>{example.question}</p>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{toCroatianLongDate(example.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
