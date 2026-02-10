import { useState, useEffect, useMemo } from 'react';
import { fetchAdminForms, getAdminFormPdfUrl, type ApiFormRequest } from './api/adminClient';
import { formatDateTime } from './utils/dateFormat';

function formTypeLabel(type: string): string {
  if (type === 'novorodeno_dijete') return 'Novorođeno dijete';
  if (type === 'jednokratna_novcana_pomoc') return 'Jednokratna pomoć';
  return type || '—';
}

export function Forms() {
  const [list, setList] = useState<ApiFormRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRef, setFilterRef] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAdminForms()
      .then(setList)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!filterRef.trim()) return list;
    const q = filterRef.trim().toLowerCase();
    return list.filter((row) => (row.reference_number ?? '').toLowerCase().includes(q));
  }, [list, filterRef]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
        Učitavanje...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Pretraži po referentnom broju..."
          value={filterRef}
          onChange={(e) => setFilterRef(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            minWidth: '220px',
          }}
        />
      </div>
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Datum</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Tip</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Ref broj</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '1.5rem', color: '#6b7280', textAlign: 'center' }}>
                  Nema zahtjeva.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.reference_number} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatDateTime(row.created_at)}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formTypeLabel(row.type)}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.status ?? '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.reference_number}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <a
                      href={getAdminFormPdfUrl(row.reference_number)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        color: '#2563eb',
                        textDecoration: 'none',
                        border: '1px solid #93c5fd',
                        borderRadius: '0.375rem',
                        backgroundColor: '#eff6ff',
                        display: 'inline-block',
                      }}
                    >
                      Otvori PDF
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
