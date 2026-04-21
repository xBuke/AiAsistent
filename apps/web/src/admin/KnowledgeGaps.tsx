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
  toast.className =
    'fixed right-5 top-5 z-[10000] rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-white shadow-lg';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 2000);
}

function toCroatianLongDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('hr-HR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Knowledge Gaps</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pitanja građana na koja asistent nije mogao odgovoriti
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleCategorize}
            disabled={categorizing}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {categorizing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            Analiziraj kategorije
          </button>
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
            {RANGE_BUTTONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                  range === option.value ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(loadingSuggestions || suggestionsVisible) && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {loadingSuggestions
            ? Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="mb-2 h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                </div>
              ))
            : suggestions.map((item, idx) => (
                <article key={`${item.category}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{item.category}</p>
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                  </div>
                  <p className="mb-2 text-xs text-slate-500">{item.count} upita</p>
                  <p className="text-sm text-slate-700">{item.suggestion}</p>
                </article>
              ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ukupno pitanja</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{totalQuestions}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Bez odgovora danas</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{noAnswerToday}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Nekategorizirano</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{uncategorizedCount}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pretraži pitanja..."
              className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-blue-500 focus:ring-2"
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
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, groupIdx) => (
              <div key={groupIdx} className="space-y-3">
                <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
                {Array.from({ length: 2 }).map((__, cardIdx) => (
                  <div key={cardIdx} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 h-4 w-4/5 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : groupedGaps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 h-12 w-12 rounded-full bg-slate-100" />
            <p className="text-base font-medium text-slate-900">Nema evidentiranih praznina znanja</p>
            <p className="mt-1 text-sm text-slate-600">
              Pitanja na koja asistent ne zna odgovoriti pojavit će se ovdje
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedGaps.map(([category, items]) => (
              <div key={category}>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{category}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map((gap) => (
                    <article key={gap.id} className="rounded-lg border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-900">{gap.question}</p>
                      <div className="mt-3 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <span className="inline-flex items-center gap-1">
                            <RefreshCw className="h-4 w-4" />
                            {gap.count}
                          </span>
                          <span>{toCroatianLongDate(gap.last_seen_at)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDetail(gap.id)}
                          className="text-left font-medium text-blue-600 hover:text-blue-700"
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
        <div className="fixed inset-0 z-[9999]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full bg-white shadow-xl sm:max-w-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-slate-900">Detalji praznine znanja</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Zatvori"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[calc(100%-73px)] overflow-y-auto px-4 py-4 sm:px-6">
              {drawerLoading ? (
                <div className="space-y-3">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
                </div>
              ) : !drawerDetail ? (
                <p className="text-sm text-slate-600">Nema podataka za prikaz.</p>
              ) : (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Pitanje</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{drawerDetail.question}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        drawerDetail.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {drawerDetail.status === 'resolved' ? 'resolved' : 'open'}
                    </span>
                    <span className="text-xs text-slate-500">
                      Prvo viđeno: {toCroatianLongDate(drawerDetail.first_seen_at)}
                    </span>
                    <span className="text-xs text-slate-500">
                      Zadnje viđeno: {toCroatianLongDate(drawerDetail.last_seen_at)}
                    </span>
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Primjeri poruka</p>
                    {(drawerDetail.examples || []).length === 0 ? (
                      <p className="text-sm text-slate-600">Nema dostupnih primjera.</p>
                    ) : (
                      <div className="space-y-2">
                        {drawerDetail.examples.map((example, idx) => (
                          <div key={`${example.conversation_id}-${idx}`} className="rounded-lg border border-slate-200 p-3">
                            <p className="text-sm text-slate-800">{example.question}</p>
                            <p className="mt-1 text-xs text-slate-500">{toCroatianLongDate(example.created_at)}</p>
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
