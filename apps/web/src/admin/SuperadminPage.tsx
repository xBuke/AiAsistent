import { useEffect, useMemo, useState } from 'react';
import {
  createAdminUser,
  deleteAdminUser,
  fetchSuperadminCities,
  type AdminRole,
  type SuperadminCity,
} from './api/adminClient';

type CityUserRole = Exclude<AdminRole, 'superadmin'>;

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

export function SuperadminPage({ onLogout }: SuperadminPageProps) {
  const [cities, setCities] = useState<SuperadminCity[]>([]);
  const [expandedSlug, setExpandedSlug] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { name: string; password: string; role: CityUserRole }>>({});

  const citiesSorted = useMemo(() => [...cities].sort((a, b) => a.name.localeCompare(b.name, 'hr')), [cities]);

  const loadCities = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSuperadminCities();
      setCities(data);
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
                  </div>
                )}
              </div>
            );
          })}
      </section>
    </div>
  );
}
