import { useEffect, useMemo, useRef, useState } from 'react';
import { ToggleSwitch } from './components/ToggleSwitch';

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
  is_active: boolean;
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
    is_active: item.is_active === undefined ? true : Boolean(item.is_active),
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleToggleActive = async (doc: DocumentItem) => {
    const previousActive = doc.is_active;
    setToggleError(null);

    setDocuments((prev) =>
      prev.map((item) =>
        item.id === doc.id
          ? {
              ...item,
              is_active: !item.is_active,
            }
          : item
      )
    );
    setTogglingIds((prev) => ({ ...prev, [doc.id]: true }));

    try {
      const res = await fetch(
        `${BASE}/admin/document-files/${encodeURIComponent(doc.id)}/toggle`,
        {
          ...defaultOpts,
          method: 'PATCH',
        }
      );

      if (!res.ok) {
        throw new Error(`Toggle: ${res.status}`);
      }
    } catch (_err) {
      setDocuments((prev) =>
        prev.map((item) =>
          item.id === doc.id
            ? {
                ...item,
                is_active: previousActive,
              }
            : item
        )
      );
      setToggleError('Neuspješno ažuriranje statusa dokumenta.');
      window.setTimeout(() => {
        setToggleError(null);
      }, 2500);
    } finally {
      setTogglingIds((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
    }
  };

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
    setUploadSuccess(false);
    setUploadError(null);
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
        is_active: true,
      };

      setDocuments((prev) => [created, ...prev]);
      setSelectedFile(null);
      setUploadSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Greška pri uploadu dokumenta';
      setUploadError(message);
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-documents">
      <div className="admin-documents__grid">
        <div className="admin-documents__features">
          <article className="admin-feature-card">
            <div className="admin-feature-card__icon" aria-hidden="true">
              📄
            </div>
            <h3 className="admin-feature-card__title">Selektivni pristup dokumentima</h3>
            <p className="admin-feature-card__desc">
              Uploadajte dokumente, ali widgetu dajte pristup samo onima koje odaberete — npr. samo komunalne usluge i
              radno vrijeme, ne interni akti.
            </p>
          </article>
          <article className="admin-feature-card">
            <div className="admin-feature-card__icon" aria-hidden="true">
              ⚡
            </div>
            <h3 className="admin-feature-card__title">Ažuriranje u realnom vremenu</h3>
            <p className="admin-feature-card__desc">
              Promijenite koji dokumenti su aktivni iz admin sučelja u bilo kojem trenutku. Widget odmah reflektira
              promjenu — bez tehničke intervencije.
            </p>
          </article>
          <article className="admin-feature-card">
            <div className="admin-feature-card__icon" aria-hidden="true">
              🔒
            </div>
            <h3 className="admin-feature-card__title">Vaši podaci, vaša pravila</h3>
            <p className="admin-feature-card__desc">
              Svaki grad ima potpuno izoliranu bazu. Nitko drugi nema pristup vašim dokumentima, upitima niti podacima
              građana.
            </p>
          </article>
        </div>

        <section className="admin-documents-active">
          <h2 className="admin-documents-active__title">Aktivni dokumenti</h2>
          {toggleError && <div className="admin-upload-status admin-upload-status--error">{toggleError}</div>}
          {loading ? (
            <div className="admin-documents-active__empty">Učitavanje dokumenata...</div>
          ) : sortedDocuments.length === 0 ? (
            <div className="admin-documents-active__empty">Nema uploadanih dokumenata</div>
          ) : (
            <ul className="admin-documents-active__list">
              {sortedDocuments.map((doc) => (
                <li key={doc.id} className="admin-documents-active__row">
                  <ToggleSwitch
                    checked={doc.is_active}
                    disabled={Boolean(togglingIds[doc.id])}
                    onChange={() => handleToggleActive(doc)}
                  />
                  <div className="admin-documents-active__name-wrap">
                    <div className="admin-documents-active__name">{doc.filename}</div>
                    <div className="admin-upload-selected__meta">
                      {formatFileSize(doc.file_size)} · {doc.chunk_count ?? '—'} chunkova · {formatUploadedAt(doc.uploaded_at)}
                    </div>
                  </div>
                  <div className="admin-documents-active__actions">
                    <span className="admin-documents-active__badge">{(doc.file_type ?? 'UNK').toUpperCase()}</span>
                    <button type="button" className="admin-btn-danger" onClick={() => handleDelete(doc)}>
                      Obriši
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="admin-documents-upload">
        <div
          className={`admin-upload-zone ${isDragOver ? 'admin-upload-zone--dragover' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!uploading) setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (uploading) return;
            const file = e.dataTransfer.files?.[0] ?? null;
            if (file) {
              setSelectedFile(file);
              setUploadSuccess(false);
              setUploadError(null);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => {
              setSelectedFile(e.target.files?.[0] ?? null);
              setUploadSuccess(false);
              setUploadError(null);
            }}
            className="admin-upload-zone__input"
          />
          <div className="admin-upload-zone__title">Povuci dokument ovdje ili klikni za odabir</div>
          <div className="admin-upload-zone__subtitle">Podržano: PDF, DOCX, TXT, MD</div>
        </div>

        {selectedFile && (
          <div className="admin-upload-selected">
            <div>
              <div className="admin-upload-selected__name">{selectedFile.name}</div>
              <div className="admin-upload-selected__meta">{formatFileSize(selectedFile.size)}</div>
            </div>
            <button
              type="button"
              className="admin-upload-selected__remove"
              onClick={() => {
                setSelectedFile(null);
                setUploadSuccess(false);
                setUploadError(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              aria-label="Ukloni odabranu datoteku"
            >
              ✕
            </button>
          </div>
        )}

        {uploading && <progress className="admin-progress" />}

        <div className="admin-upload-actions">
          <button type="button" disabled={!selectedFile || uploading} onClick={handleUpload} className="admin-btn-primary">
            {uploading ? 'Uploading...' : 'Upload dokumenta'}
          </button>
        </div>

        {uploadSuccess && <div className="admin-upload-status admin-upload-status--success">✓ Dokument uspješno dodan</div>}
        {uploadError && <div className="admin-upload-status admin-upload-status--error">{uploadError}</div>}
      </div>
    </div>
  );
}
