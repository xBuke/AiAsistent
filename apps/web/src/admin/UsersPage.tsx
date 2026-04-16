import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  type AdminRole,
  type AdminUser,
} from './api/adminClient';

type CityUserRole = Exclude<AdminRole, 'superadmin'>;

const ROLE_OPTIONS: Array<{ value: CityUserRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'conversations', label: 'Conversations' },
  { value: 'forms', label: 'Forms' },
  { value: 'readonly', label: 'Readonly' },
];

const ROLE_BADGE_COLORS: Record<CityUserRole, string> = {
  admin: '#3b82f6',
  inbox: '#8b5cf6',
  conversations: '#10b981',
  forms: '#f59e0b',
  readonly: 'var(--text-secondary)',
};

interface UsersPageProps {
  cityCode: string;
  currentUserId?: string;
}

export function UsersPage({ cityCode, currentUserId }: UsersPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<CityUserRole>('inbox');
  const [submitting, setSubmitting] = useState(false);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name, 'hr', { sensitivity: 'base' })),
    [users]
  );

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminUsers(cityCode);
      setUsers(data);
    } catch {
      setError('Neuspjelo učitavanje korisnika.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [cityCode]);

  const handleAddUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim() || !newPassword.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await createAdminUser(cityCode, {
        name: newName.trim(),
        password: newPassword,
        role: newRole,
      });
      setUsers((prev) => [...prev, created]);
      setNewName('');
      setNewPassword('');
      setNewRole('inbox');
    } catch {
      setError('Neuspjelo dodavanje korisnika.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!window.confirm(`Obrisati korisnika "${user.name}"?`)) return;
    setError('');
    try {
      await deleteAdminUser(cityCode, user.id);
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
    } catch {
      setError('Neuspjelo brisanje korisnika.');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', alignItems: 'start' }}>
      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>👥 Upravljanje korisnicima</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          Dodajte djelatnike i dodijelite im pristup samo onim dijelovima sustava koji su im potrebni.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Admin — puni pristup</li>
          <li>Inbox — Ticketi i Forme</li>
          <li>Conversations — samo Konverzacije</li>
          <li>Forms — samo Forme</li>
          <li>Readonly — samo Izvještaji</li>
        </ul>
      </section>

      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, color: 'var(--text-primary)', fontSize: 20 }}>Korisnici grada</h3>
        {error && <div style={{ marginBottom: 12, color: '#ef4444', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {loading && <div style={{ color: 'var(--text-secondary)' }}>Učitavanje...</div>}
          {!loading &&
            sortedUsers.map((user) => {
              const isSelf = Boolean(currentUserId) && currentUserId === user.id;
              return (
                <div
                  key={user.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{user.name}</span>
                    <span
                      style={{
                        borderRadius: 999,
                        fontSize: 12,
                        padding: '2px 8px',
                        border: `1px solid ${ROLE_BADGE_COLORS[user.role]}`,
                        color: ROLE_BADGE_COLORS[user.role],
                      }}
                    >
                      {user.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteUser(user)}
                    disabled={isSelf}
                    className="admin-btn-secondary"
                    style={{ opacity: isSelf ? 0.55 : 1 }}
                    title={isSelf ? 'Ne možete obrisati vlastiti račun' : 'Obriši korisnika'}
                  >
                    Obriši
                  </button>
                </div>
              );
            })}
        </div>

        <form onSubmit={handleAddUser} style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
          <h4 style={{ marginTop: 0, marginBottom: 12, color: 'var(--text-primary)' }}>Dodaj korisnika</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ime korisnika"
              className="admin-input"
              disabled={submitting}
            />
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Lozinka"
              type="password"
              className="admin-input"
              disabled={submitting}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as CityUserRole)}
              className="admin-select"
              disabled={submitting}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={submitting || !newName.trim() || !newPassword.trim()}
            >
              Dodaj
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
