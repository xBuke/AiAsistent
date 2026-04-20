import { useEffect, useMemo, useState } from 'react';
import {
  createAdminUser,
  deleteAdminUser,
  fetchSuperadminCities,
  type AdminRole,
  type SuperadminCity,
} from './api/adminClient';
import { FormDefinitions } from './FormDefinitions';

type CityUserRole = Exclude<AdminRole, 'superadmin'>;
type SuperadminCityView = SuperadminCity & { allowed_domains: string[]; code?: string };

const API_BASE = import.meta.env.PROD
  ? '/api'
  : ((import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'http://localhost:3000');

const ROLE_OPTIONS: Array<{ value: CityUserRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'conversations', label: 'Conversations' },
  { value: 'forms', label: 'Forms' },
  { value: 'readonly', label: 'Readonly' },
];

interface SuperadminPageProps {
  onLogout: () => void;
}

function normalizeCroatian(value: string): string {
  return value
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/đ/g, 'd')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/Č/g, 'C')
    .replace(/Ć/g, 'C')
    .replace(/Đ/g, 'D')
    .replace(/Š/g, 'S')
    .replace(/Ž/g, 'Z');
}

function toSlug(name: string): string {
  return normalizeCroatian(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function toCode(name: string): string {
  const normalized = normalizeCroatian(name).toLowerCase().replace(/[^a-z]/g, '');
  const consonants = normalized.replace(/[aeiou]/g, '');
  if (consonants.length >= 3) return consonants.slice(0, 3).toUpperCase();
  if (consonants.length >= 2) return consonants.slice(0, 2).toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
}

export function SuperadminPage({ onLogout }: SuperadminPageProps) {
  const [cities, setCities] = useState<SuperadminCityView[]>([]);
  const [expandedSlug, setExpandedSlug] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { name: string; password: string; role: CityUserRole }>>({});
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [codeTouched, setCodeTouched] = useState(false);
  const [createDomainInput, setCreateDomainInput] = useState('');
  const [createDomains, setCreateDomains] = useState<string[]>([]);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [cityDomainDrafts, setCityDomainDrafts] = useState<Record<string, string>>({});
  const [savingCityDomains, setSavingCityDomains] = useState<Record<string, boolean>>({});
  const [copiedCity, setCopiedCity] = useState('');
  const [formsCityId, setFormsCityId] = useState('');

  const citiesSorted = useMemo(() => [...cities].sort((a, b) => a.name.localeCompare(b.name, 'hr')), [cities]);

  const loadCities = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSuperadminCities();
      setCities(
        data.map((city) => ({
          ...city,
          allowed_domains: Array.isArray((city as { allowed_domains?: unknown }).allowed_domains)
            ? ((city as { allowed_domains?: unknown }).allowed_domains as string[]).filter((d) => typeof d === 'string')
            : [],
        }))
      );
    } catch {
      setError('Neuspjelo učitavanje gradova.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCities();
  }, []);

  const ensureDraft = (slug: string) => drafts[slug] ?? { name: '', password: '', role: 'inbox' as CityUserRole };

  const setDraft = (slug: string, update: Partial<{ name: string; password: string; role: CityUserRole }>) => {
    setDrafts((prev) => ({ ...prev, [slug]: { ...ensureDraft(slug), ...update } }));
  };

  const handleCreateNameChange = (value: string) => {
    setCreateName(value);
    if (!slugTouched) setCreateSlug(toSlug(value));
    if (!codeTouched) setCreateCode(toCode(value));
  };

  const addCreateDomain = () => {
    const next = createDomainInput.trim().toLowerCase();
    if (!next || createDomains.includes(next)) return;
    setCreateDomains((prev) => [...prev, next]);
    setCreateDomainInput('');
  };

  const removeCreateDomain = (domain: string) => {
    setCreateDomains((prev) => prev.filter((d) => d !== domain));
  };

  const handleCreateCity = async () => {
    if (!createName.trim() || !createSlug.trim() || !createCode.trim()) {
      setCreateError('Naziv, slug i code su obavezni.');
      return;
    }
    setCreateError('');
    setCreateSuccess('');
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/superadmin/cities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          slug: createSlug.trim(),
          code: createCode.trim(),
          allowed_domains: createDomains,
        }),
      });
      const payload = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        if (res.status === 409) {
          setCreateError('Slug već postoji.');
        } else {
          setCreateError(payload.error || 'Neuspjelo kreiranje grada.');
        }
        return;
      }
      setCreateName('');
      setCreateSlug('');
      setCreateCode('');
      setCreateDomains([]);
      setCreateDomainInput('');
      setSlugTouched(false);
      setCodeTouched(false);
      setCreateSuccess('Grad uspješno kreiran');
      await loadCities();
      window.setTimeout(() => setCreateSuccess(''), 2000);
    } catch {
      setCreateError('Neuspjelo kreiranje grada.');
    } finally {
      setCreating(false);
    }
  };

  const patchCityDomains = async (cityId: string, nextDomains: string[]) => {
    const previousCities = cities;
    setSavingCityDomains((prev) => ({ ...prev, [cityId]: true }));
    setCities((prev) => prev.map((city) => (city.id === cityId ? { ...city, allowed_domains: nextDomains } : city)));
    try {
      const res = await fetch(`${API_BASE}/superadmin/cities/${encodeURIComponent(cityId)}/domains`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowed_domains: nextDomains }),
      });
      if (!res.ok) throw new Error('patch domains failed');
    } catch {
      setCities(previousCities);
      setError('Neuspjelo spremanje domena.');
    } finally {
      setSavingCityDomains((prev) => ({ ...prev, [cityId]: false }));
    }
  };

  const addCityDomain = async (cityId: string) => {
    const draft = (cityDomainDrafts[cityId] || '').trim().toLowerCase();
    if (!draft) return;
    const city = cities.find((c) => c.id === cityId);
    if (!city || city.allowed_domains.includes(draft)) return;
    setCityDomainDrafts((prev) => ({ ...prev, [cityId]: '' }));
    await patchCityDomains(cityId, [...city.allowed_domains, draft]);
  };

  const removeCityDomain = async (cityId: string, domain: string) => {
    const city = cities.find((c) => c.id === cityId);
    if (!city) return;
    await patchCityDomains(
      cityId,
      city.allowed_domains.filter((d) => d !== domain)
    );
  };

  const copySnippet = async (citySlug: string) => {
    const snippet = `<script 
  src="https://civisai.mangai.hr/widget.js" 
  data-city-id="${citySlug}"
  data-api-base="https://asistent-api-nine.vercel.app/api"
  defer>
</script>`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedCity(citySlug);
      window.setTimeout(() => setCopiedCity(''), 1500);
    } catch {
      setError('Neuspjelo kopiranje snippet-a.');
    }
  };

  const handleAdd = async (citySlug: string) => {
    const draft = ensureDraft(citySlug);
    if (!draft.name.trim() || !draft.password.trim()) return;
    setError('');
    try {
      const created = await createAdminUser(citySlug, {
        name: draft.name.trim(),
        password: draft.password,
        role: draft.role,
      });
      setCities((prev) =>
        prev.map((city) =>
          city.slug === citySlug
            ? { ...city, city_users: [...city.city_users, created], userCount: city.userCount + 1 }
            : city
        )
      );
      setDraft(citySlug, { name: '', password: '', role: 'inbox' });
    } catch {
      setError('Neuspjelo dodavanje korisnika.');
    }
  };

  const handleDelete = async (citySlug: string, userId: string) => {
    if (!window.confirm('Obrisati korisnika?')) return;
    setError('');
    try {
      await deleteAdminUser(citySlug, userId);
      setCities((prev) =>
        prev.map((city) =>
          city.slug === citySlug
            ? {
                ...city,
                city_users: city.city_users.filter((u) => u.id !== userId),
                userCount: Math.max(0, city.userCount - 1),
              }
            : city
        )
      );
    } catch {
      setError('Neuspjelo brisanje korisnika.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Civis Superadmin</h1>
        <button type="button" className="admin-btn-secondary" onClick={onLogout}>
          Odjava
        </button>
      </header>

      <section
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Forme</h2>
        <label style={{ display: 'block', marginBottom: 12, color: 'var(--text-primary)', fontSize: 14 }}>
          Grad
          <select
            className="admin-select"
            value={formsCityId}
            onChange={(e) => setFormsCityId(e.target.value)}
            style={{ display: 'block', width: '100%', maxWidth: 420, marginTop: 8 }}
          >
            <option value="">— odaberite grad —</option>
            {citiesSorted.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name} ({city.slug})
              </option>
            ))}
          </select>
        </label>
        <FormDefinitions variant="superadmin" superadminCityId={formsCityId || null} />
      </section>

      <section
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Kreiraj novi grad</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <input
            className="admin-input"
            placeholder="Naziv grada"
            value={createName}
            onChange={(e) => handleCreateNameChange(e.target.value)}
          />
          <input
            className="admin-input"
            placeholder="Slug"
            value={createSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setCreateSlug(e.target.value);
            }}
          />
          <input
            className="admin-input"
            placeholder="Code"
            value={createCode}
            onChange={(e) => {
              setCodeTouched(true);
              setCreateCode(e.target.value.toUpperCase());
            }}
          />
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          <input
            className="admin-input"
            placeholder="Allowed domain (npr. zagreb.hr)"
            value={createDomainInput}
            onChange={(e) => setCreateDomainInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCreateDomain();
              }
            }}
          />
          <button type="button" className="admin-btn-secondary" onClick={addCreateDomain}>
            Dodaj
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {createDomains.map((domain) => (
            <button
              key={domain}
              type="button"
              className="admin-btn-secondary"
              onClick={() => removeCreateDomain(domain)}
              style={{ padding: '4px 10px' }}
            >
              {domain} ×
            </button>
          ))}
        </div>

        {createError && <div style={{ color: '#ef4444', marginTop: 10 }}>{createError}</div>}
        {createSuccess && <div style={{ color: 'var(--accent)', marginTop: 10 }}>{createSuccess}</div>}

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="admin-btn-primary"
            onClick={() => void handleCreateCity()}
            disabled={creating || !createName.trim() || !createSlug.trim() || !createCode.trim()}
          >
            Kreiraj grad
          </button>
        </div>
      </section>

      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Gradovi</h2>
        {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>{error}</div>}
        {loading && <div style={{ color: 'var(--text-secondary)' }}>Učitavanje...</div>}
        {!loading &&
          citiesSorted.map((city) => {
            const isOpen = expandedSlug === city.slug;
            const draft = ensureDraft(city.slug);
            return (
              <div key={city.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setExpandedSlug((prev) => (prev === city.slug ? '' : city.slug))}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 0,
                    color: 'var(--text-primary)',
                    textAlign: 'left',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{city.name} ({city.slug})</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{city.userCount} korisnika</span>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border-color)', padding: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {city.city_users.map((user) => (
                        <div
                          key={user.id}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}
                        >
                          <span>
                            {user.name} <span style={{ color: 'var(--text-secondary)' }}>({user.role})</span>
                          </span>
                          <button
                            type="button"
                            className="admin-btn-secondary"
                            onClick={() => void handleDelete(city.slug, user.id)}
                          >
                            Obriši
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 18 }}>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Dozvoljene domene</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {city.allowed_domains.map((domain) => (
                          <button
                            key={domain}
                            type="button"
                            className="admin-btn-secondary"
                            disabled={Boolean(savingCityDomains[city.id])}
                            onClick={() => void removeCityDomain(city.id, domain)}
                            style={{ padding: '4px 10px' }}
                          >
                            {domain} ×
                          </button>
                        ))}
                        {city.allowed_domains.length === 0 && (
                          <span style={{ color: 'var(--text-secondary)' }}>Nema dodanih domena.</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <input
                          className="admin-input"
                          placeholder="Dodaj domenu"
                          value={cityDomainDrafts[city.id] || ''}
                          onChange={(e) => setCityDomainDrafts((prev) => ({ ...prev, [city.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void addCityDomain(city.id);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="admin-btn-secondary"
                          disabled={Boolean(savingCityDomains[city.id])}
                          onClick={() => void addCityDomain(city.id)}
                        >
                          Dodaj domenu
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10 }}>
                      <input
                        className="admin-input"
                        placeholder="Ime korisnika"
                        value={draft.name}
                        onChange={(e) => setDraft(city.slug, { name: e.target.value })}
                      />
                      <input
                        className="admin-input"
                        placeholder="Lozinka"
                        type="password"
                        value={draft.password}
                        onChange={(e) => setDraft(city.slug, { password: e.target.value })}
                      />
                      <select
                        className="admin-select"
                        value={draft.role}
                        onChange={(e) => setDraft(city.slug, { role: e.target.value as CityUserRole })}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="admin-btn-primary"
                        onClick={() => void handleAdd(city.slug)}
                        disabled={!draft.name.trim() || !draft.password.trim()}
                      >
                        Dodaj
                      </button>
                    </div>

                    <div style={{ marginTop: 18 }}>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Embed snippet</h3>
                      <pre
                        style={{
                          margin: 0,
                          padding: 12,
                          borderRadius: 8,
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          overflowX: 'auto',
                          color: 'var(--text-primary)',
                        }}
                      >
{`<script 
  src="https://civisai.mangai.hr/widget.js" 
  data-city-id="${city.slug}"
  data-api-base="https://asistent-api-nine.vercel.app/api"
  defer>
</script>`}
                      </pre>
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button type="button" className="admin-btn-secondary" onClick={() => void copySnippet(city.slug)}>
                          Kopiraj snippet
                        </button>
                        {copiedCity === city.slug && <span style={{ color: 'var(--accent)' }}>Kopirano!</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </section>
    </div>
  );
}
