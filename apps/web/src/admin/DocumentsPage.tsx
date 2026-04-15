import { useEffect, useMemo, useState } from 'react';

interface DocumentsPageProps {
  cityId: string;
}

interface DocumentItem {
  id: string;
  filename: string;
  file_type: string | null;
  file_size: number | null;
  chunk_count: number | null;
  uploaded_at: string | null;
}

const BASE = import.meta.env.PROD
  ? '/api'
  : ((import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'http://localhost:3000');

const defaultOpts: RequestInit = { credentials: 'include' };

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUploadedAt(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('hr-HR');
}

function normalizeDoc(input: unknown): DocumentItem | null {
  if (!input || typeof input !== 'object') return null;
  const item = input as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id : '';
  if (!id) return null;

  return {
    id,
    filename: typeof item.filename === 'string' ? item.filename : 'Nepoznato',
    file_type: typeof item.file_type === 'string' ? item.file_type : null,
    file_size: typeof item.file_size === 'number' ? item.file_size : null,
    chunk_count: typeof item.chunk_count === 'number' ? item.chunk_count : null,
    uploaded_at: typeof item.uploaded_at === 'string' ? item.uploaded_at : null,
  };
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error.trim().length > 0) {
      return data.error;
    }
    if (data && typeof data.message === 'string' && data.message.trim().length > 0) {
      return data.message;
    }
  } catch {
    // ignore json parse failures and fall back
  }
  return fallback;
}

export function DocumentsPage({ cityId }: DocumentsPageProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const cityCode = cityId;

  useEffect(() => {
    let active = true;

    async function loadDocuments() {
      setLoading(true);
      try {
        const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/documents`, {
          ...defaultOpts,
          method: 'GET',
        });

        if (!res.ok) {
          throw new Error(`Dokumenti: ${res.status}`);
        }

        const data = await res.json();
        const next = Array.isArray(data)
          ? data.map(normalizeDoc).filter((doc): doc is DocumentItem => !!doc)
          : [];

        if (active) {
          setDocuments(next);
        }
      } catch (_err) {
        if (active) {
          alert('Greška pri učitavanju dokumenata');
          setDocuments([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDocuments();

    return () => {
      active = false;
    };
  }, [cityCode]);

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      const aTs = a.uploaded_at ? Date.parse(a.uploaded_at) : 0;
      const bTs = b.uploaded_at ? Date.parse(b.uploaded_at) : 0;
      return bTs - aTs;
    });
  }, [documents]);

  const handleDelete = async (doc: DocumentItem) => {
    const confirmed = window.confirm(`Obrisati dokument "${doc.filename}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(
        `${BASE}/admin/${encodeURIComponent(cityCode)}/documents/${encodeURIComponent(doc.id)}`,
        {
          ...defaultOpts,
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        throw new Error(`Delete: ${res.status}`);
      }

      setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
    } catch (_err) {
      alert('Greška pri brisanju dokumenta');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || uploading) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/documents`, {
        ...defaultOpts,
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const message = await parseErrorMessage(res, 'Greška pri uploadu dokumenta');
        throw new Error(message);
      }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const created: DocumentItem = {
        id: typeof data.id === 'string' ? data.id : `tmp-${Date.now()}`,
        filename: typeof data.filename === 'string' ? data.filename : selectedFile.name,
        file_type: selectedFile.name.includes('.') ? selectedFile.name.split('.').pop() ?? null : null,
        file_size: selectedFile.size,
        chunk_count: typeof data.chunk_count === 'number' ? data.chunk_count : null,
        uploaded_at: new Date().toISOString(),
      };

      setDocuments((prev) => [created, ...prev]);
      setSelectedFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Greška pri uploadu dokumenta';
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          padding: '1rem',
        }}
      >
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: '0.875rem' }}
        />
        <button
          type="button"
          disabled={!selectedFile || uploading}
          onClick={handleUpload}
          style={{
            padding: '0.5rem 0.875rem',
            backgroundColor: !selectedFile || uploading ? '#9ca3af' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: !selectedFile || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'Uploading...' : 'Upload dokumenta'}
        </button>
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
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#374151' }}>Naziv datoteke</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#374151' }}>Tip</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#374151' }}>Veličina</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#374151' }}>Broj chunkova</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#374151' }}>Uploadano</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#374151' }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
                  Učitavanje...
                </td>
              </tr>
            ) : sortedDocuments.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
                  Nema uploadanih dokumenata
                </td>
              </tr>
            ) : (
              sortedDocuments.map((doc) => (
                <tr key={doc.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{doc.filename}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{doc.file_type ?? '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatFileSize(doc.file_size)}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{doc.chunk_count ?? '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>{formatUploadedAt(doc.uploaded_at)}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      style={{
                        padding: '0.375rem 0.625rem',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        color: '#b91c1c',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                      }}
                    >
                      Obriši
                    </button>
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
