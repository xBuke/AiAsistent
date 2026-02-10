import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchAdminForms,
  getAdminFormPdfUrl,
  fetchAdminFormAttachments,
  fetchAdminFormAttachmentSignedUrl,
  type ApiFormRequest,
  type ApiAttachment,
} from './api/adminClient';
import { Drawer } from './components/Drawer';
import { formatDateTime } from './utils/dateFormat';

function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [attachmentsByRef, setAttachmentsByRef] = useState<Record<string, ApiAttachment[]>>({});
  const [attachmentsLoadingByRef, setAttachmentsLoadingByRef] = useState<Record<string, boolean>>({});
  const [attachmentsErrorByRef, setAttachmentsErrorByRef] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAdminForms()
      .then(setList)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const loadAttachments = useCallback((referenceNumber: string) => {
    setAttachmentsLoadingByRef((prev) => ({ ...prev, [referenceNumber]: true }));
    setAttachmentsErrorByRef((prev) => ({ ...prev, [referenceNumber]: null }));
    fetchAdminFormAttachments(referenceNumber)
      .then((rows) => {
        setAttachmentsByRef((prev) => ({ ...prev, [referenceNumber]: rows }));
        setAttachmentsErrorByRef((prev) => ({ ...prev, [referenceNumber]: null }));
      })
      .catch(() => {
        setAttachmentsErrorByRef((prev) => ({
          ...prev,
          [referenceNumber]: 'Ne mogu učitati priloge.',
        }));
      })
      .finally(() => {
        setAttachmentsLoadingByRef((prev) => ({ ...prev, [referenceNumber]: false }));
      });
  }, []);

  useEffect(() => {
    if (selectedRef) {
      loadAttachments(selectedRef);
    }
  }, [selectedRef, loadAttachments]);

  const handleOpenAttachment = useCallback(
    async (referenceNumber: string, attachmentId: string) => {
      try {
        const url = await fetchAdminFormAttachmentSignedUrl(referenceNumber, attachmentId);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        // Silent fail or could show toast
      }
    },
    []
  );

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
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Prilozi</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '1.5rem', color: '#6b7280', textAlign: 'center' }}>
                  Nema zahtjeva.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const count = attachmentsByRef[row.reference_number]?.length;
                const countDisplay = count !== undefined ? String(count) : '—';
                return (
                  <tr key={row.reference_number} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatDateTime(row.created_at)}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formTypeLabel(row.type)}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.status ?? '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{row.reference_number}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedRef(row.reference_number)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          color: '#374151',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                        }}
                      >
                        Prilozi ({countDisplay})
                      </button>
                    </td>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        isOpen={!!selectedRef}
        onClose={() => setSelectedRef(null)}
        title={selectedRef ? `Zahtjev ${selectedRef}` : ''}
      >
        {selectedRef && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <a
                href={getAdminFormPdfUrl(selectedRef)}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
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
            </div>

            <div>
              <h3
                style={{
                  margin: '0 0 0.75rem 0',
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                Prilozi
              </h3>
              {attachmentsLoadingByRef[selectedRef] ? (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Učitavanje...</p>
              ) : attachmentsErrorByRef[selectedRef] ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ margin: 0, color: '#991b1b', fontSize: '0.875rem' }}>
                    Ne mogu učitati priloge.
                  </p>
                  <button
                    type="button"
                    onClick={() => loadAttachments(selectedRef)}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.8125rem',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    Pokušaj ponovno
                  </button>
                </div>
              ) : !attachmentsByRef[selectedRef]?.length ? (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Nema priloga.</p>
              ) : (
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  {[...(attachmentsByRef[selectedRef] ?? [])]
                    .sort((a, b) => (a.stored_filename ?? '').localeCompare(b.stored_filename ?? ''))
                    .map((att) => (
                      <li
                        key={att.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          padding: '0.5rem 0.75rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
                          <span style={{ fontWeight: 500, color: '#111827', display: 'block' }}>
                            {att.stored_filename}
                          </span>
                          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                            {att.mime_type} · {formatSize(att.size_bytes)}
                            {att.created_at ? ` · ${formatDateTime(att.created_at)}` : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenAttachment(selectedRef, att.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            color: '#2563eb',
                            backgroundColor: '#eff6ff',
                            border: '1px solid #93c5fd',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          Otvori
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
