import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminFormDefinitionConflictError,
  createAdminFormDefinition,
  createSuperadminFormDefinition,
  deleteAdminFormDefinition,
  deleteSuperadminFormDefinition,
  fetchAdminFormDefinitions,
  fetchSuperadminFormDefinitions,
  updateAdminFormDefinition,
  updateSuperadminFormDefinition,
  type FormDefinitionAdmin,
  type FormDefinitionAttachment,
  type FormDefinitionField,
  type FormDefinitionFieldType,
} from './api/adminClient';
import { ToggleSwitch } from './components/ToggleSwitch';

const SLUG_PATTERN = /^[a-z0-9-]+$/;

const FIELD_TYPES: { value: FormDefinitionFieldType; label: string }[] = [
  { value: 'text', label: 'Tekst' },
  { value: 'date', label: 'Datum' },
  { value: 'number', label: 'Broj' },
  { value: 'select', label: 'Padajući izbornik' },
  { value: 'textarea', label: 'Dugi tekst' },
];

function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function typeBadgeLabel(t: FormDefinitionFieldType): string {
  return FIELD_TYPES.find((x) => x.value === t)?.label ?? t;
}

type BuilderDraft = {
  name: string;
  slug: string;
  description: string;
  fields: FormDefinitionField[];
  required_attachments: FormDefinitionAttachment[];
  trigger_doc_slugs: string[];
  is_active: boolean;
};

const emptyDraft = (): BuilderDraft => ({
  name: '',
  slug: '',
  description: '',
  fields: [],
  required_attachments: [],
  trigger_doc_slugs: [],
  is_active: true,
});

export type FormDefinitionsVariant = 'admin' | 'superadmin';

export interface FormDefinitionsProps {
  variant?: FormDefinitionsVariant;
  /** City UUID when variant is superadmin */
  superadminCityId?: string | null;
}

export function FormDefinitions({ variant = 'admin', superadminCityId = null }: FormDefinitionsProps) {
  const isSuperadmin = variant === 'superadmin';
  const superadminCity = (superadminCityId ?? '').trim();
  const [items, setItems] = useState<FormDefinitionAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<BuilderDraft>(emptyDraft);
  const [slugTouched, setSlugTouched] = useState(false);

  const [newTriggerInput, setNewTriggerInput] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggleBusy, setToggleBusy] = useState<Record<string, boolean>>({});

  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [fieldForm, setFieldForm] = useState<{
    label: string;
    type: FormDefinitionFieldType;
    required: boolean;
    placeholder: string;
    options: string[];
  }>({
    label: '',
    type: 'text',
    required: false,
    placeholder: '',
    options: [''],
  });

  const [attachmentFormOpen, setAttachmentFormOpen] = useState(false);
  const [attachmentForm, setAttachmentForm] = useState({
    label: '',
    description: '',
    required: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      if (isSuperadmin) {
        if (!superadminCity) {
          setItems([]);
          return;
        }
        const data = await fetchSuperadminFormDefinitions(superadminCity);
        setItems(data);
      } else {
        const data = await fetchAdminFormDefinitions();
        setItems(data);
      }
    } catch {
      setListError('Neuspjelo učitavanje definicija obrazaca.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isSuperadmin, superadminCity]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (step !== 5) setSaveError('');
  }, [step]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, 'hr', { sensitivity: 'base' })),
    [items]
  );

  const openNew = () => {
    if (isSuperadmin && !superadminCity) return;
    setEditingId(null);
    setDraft(emptyDraft());
    setSlugTouched(false);
    setStep(1);
    setSaveError('');
    setFieldFormOpen(false);
    setAttachmentFormOpen(false);
    setNewTriggerInput('');
    setBuilderOpen(true);
  };

  const openEdit = (id: string) => {
    const row = items.find((x) => x.id === id);
    if (!row) return;
    setEditingId(id);
    setDraft({
      name: row.name,
      slug: row.slug,
      description: row.description,
      fields: row.fields.map((f) => ({ ...f })),
      required_attachments: row.required_attachments.map((a) => ({ ...a })),
      trigger_doc_slugs: [...row.trigger_doc_slugs],
      is_active: row.is_active,
    });
    setSlugTouched(true);
    setStep(1);
    setSaveError('');
    setFieldFormOpen(false);
    setAttachmentFormOpen(false);
    setNewTriggerInput('');
    setBuilderOpen(true);
  };

  const closeBuilder = () => {
    setBuilderOpen(false);
    setSaveError('');
    setFieldFormOpen(false);
    setAttachmentFormOpen(false);
  };

  const onNameChange = (name: string) => {
    setDraft((d) => {
      const next = { ...d, name };
      if (!slugTouched) {
        next.slug = slugFromName(name);
      }
      return next;
    });
  };

  const onSlugChange = (slug: string) => {
    setSlugTouched(true);
    setDraft((d) => ({ ...d, slug }));
  };

  const moveField = (index: number, delta: -1 | 1) => {
    setDraft((d) => {
      const next = [...d.fields];
      const j = index + delta;
      if (j < 0 || j >= next.length) return d;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...d, fields: next };
    });
  };

  const removeField = (index: number) => {
    setDraft((d) => ({
      ...d,
      fields: d.fields.filter((_, i) => i !== index),
    }));
  };

  const toggleFieldRequired = (index: number) => {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, i) => (i === index ? { ...f, required: !f.required } : f)),
    }));
  };

  const openAddFieldForm = () => {
    setFieldForm({
      label: '',
      type: 'text',
      required: false,
      placeholder: '',
      options: [''],
    });
    setFieldFormOpen(true);
  };

  const addFieldFromForm = (e: FormEvent) => {
    e.preventDefault();
    if (!fieldForm.label.trim()) return;
    const opts =
      fieldForm.type === 'select'
        ? fieldForm.options.map((o) => o.trim()).filter(Boolean)
        : undefined;
    const field: FormDefinitionField = {
      id: newId(),
      label: fieldForm.label.trim(),
      type: fieldForm.type,
      required: fieldForm.required,
      placeholder: fieldForm.placeholder.trim(),
      ...(opts && opts.length > 0 ? { options: opts } : {}),
    };
    setDraft((d) => ({ ...d, fields: [...d.fields, field] }));
    setFieldFormOpen(false);
  };

  const removeAttachment = (index: number) => {
    setDraft((d) => ({
      ...d,
      required_attachments: d.required_attachments.filter((_, i) => i !== index),
    }));
  };

  const toggleAttachmentRequired = (index: number) => {
    setDraft((d) => ({
      ...d,
      required_attachments: d.required_attachments.map((a, i) =>
        i === index ? { ...a, required: !a.required } : a
      ),
    }));
  };

  const openAddAttachmentForm = () => {
    setAttachmentForm({ label: '', description: '', required: false });
    setAttachmentFormOpen(true);
  };

  const addAttachmentFromForm = (e: FormEvent) => {
    e.preventDefault();
    if (!attachmentForm.label.trim()) return;
    const att: FormDefinitionAttachment = {
      id: newId(),
      label: attachmentForm.label.trim(),
      description: attachmentForm.description.trim(),
      required: attachmentForm.required,
    };
    setDraft((d) => ({ ...d, required_attachments: [...d.required_attachments, att] }));
    setAttachmentFormOpen(false);
  };

  const addTriggerSlug = () => {
    const raw = newTriggerInput.trim();
    if (!raw) return;
    const normalized = raw.replace(/\.[a-z0-9]+$/i, '').trim();
    if (!normalized) return;
    setDraft((d) => {
      if (d.trigger_doc_slugs.includes(normalized)) return d;
      return { ...d, trigger_doc_slugs: [...d.trigger_doc_slugs, normalized] };
    });
    setNewTriggerInput('');
  };

  const removeTrigger = (slug: string) => {
    setDraft((d) => ({
      ...d,
      trigger_doc_slugs: d.trigger_doc_slugs.filter((s) => s !== slug),
    }));
  };

  const validateForSave = (): string | null => {
    if (!draft.name.trim()) return 'Naziv je obavezan.';
    if (!draft.slug.trim()) return 'Slug je obavezan.';
    if (!SLUG_PATTERN.test(draft.slug.trim())) {
      return 'Slug smije sadržavati samo mala slova, brojeve i crtice.';
    }
    for (const f of draft.fields) {
      if (!f.label.trim()) return 'Svako polje mora imati oznaku (label).';
    }
    return null;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateForSave();
    if (err) {
      setSaveError(err);
      return;
    }
    setSaveError('');
    if (isSuperadmin && !superadminCity && !editingId) {
      setSaveError('Odaberite grad.');
      return;
    }
    setSaving(true);
    const bodyFields = draft.fields.map((f) => {
      const base: FormDefinitionField = {
        id: f.id,
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        placeholder: f.placeholder.trim(),
      };
      if (f.type === 'select' && f.options && f.options.length > 0) {
        return { ...base, options: f.options.map((o) => o.trim()).filter(Boolean) };
      }
      return base;
    });
    const bodyAttachments = draft.required_attachments.map((a) => ({
      id: a.id,
      label: a.label.trim(),
      description: a.description.trim(),
      required: a.required,
    }));
    const triggers = draft.trigger_doc_slugs.map((s) => s.trim()).filter(Boolean);

    try {
      if (editingId) {
        const patch = {
          name: draft.name.trim(),
          slug: draft.slug.trim(),
          description: draft.description.trim() || undefined,
          fields: bodyFields,
          required_attachments: bodyAttachments,
          trigger_doc_slugs: triggers,
          is_active: draft.is_active,
        };
        const updated = isSuperadmin
          ? await updateSuperadminFormDefinition(editingId, patch)
          : await updateAdminFormDefinition(editingId, patch);
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const createBody = {
          name: draft.name.trim(),
          slug: draft.slug.trim(),
          description: draft.description.trim() || undefined,
          fields: bodyFields,
          required_attachments: bodyAttachments,
          trigger_doc_slugs: triggers,
        };
        const created = isSuperadmin
          ? await createSuperadminFormDefinition({ ...createBody, city_id: superadminCity })
          : await createAdminFormDefinition(createBody);
        setItems((prev) => [...prev, created]);
      }
      setSuccessMessage(editingId ? 'Obrazac je ažuriran.' : 'Obrazac je spremljen.');
      closeBuilder();
    } catch (ex) {
      if (ex instanceof AdminFormDefinitionConflictError) {
        setSaveError(
          'Već postoji obrazac s ovim slugom za ovaj grad. Promijenite slug i pokušajte ponovno.'
        );
      } else {
        setSaveError('Spremanje nije uspjelo. Pokušajte ponovno.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleListToggleActive = async (id: string, current: boolean) => {
    setToggleBusy((b) => ({ ...b, [id]: true }));
    try {
      const updated = isSuperadmin
        ? await updateSuperadminFormDefinition(id, { is_active: !current })
        : await updateAdminFormDefinition(id, { is_active: !current });
      setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
    } catch {
      setListError('Neuspjela promjena statusa.');
    } finally {
      setToggleBusy((b) => {
        const next = { ...b };
        delete next[id];
        return next;
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Obrisati obrazac „${name}”?`)) return;
    try {
      if (isSuperadmin) {
        await deleteSuperadminFormDefinition(id);
      } else {
        await deleteAdminFormDefinition(id);
      }
      setItems((prev) => prev.filter((x) => x.id !== id));
      setSuccessMessage('Obrazac je uklonjen s popisa.');
    } catch {
      setListError('Brisanje nije uspjelo.');
    }
  };

  const stepTitle = (n: number) => {
    switch (n) {
      case 1:
        return 'Osnovni podaci';
      case 2:
        return 'Polja obrasca';
      case 3:
        return 'Potrebni prilozi';
      case 4:
        return 'Trigger konfiguracija';
      case 5:
        return 'Pregled i spremi';
      default:
        return '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 22 }}>
          {isSuperadmin ? 'Forme' : 'Postavke formi'}
        </h2>
        <button
          type="button"
          onClick={openNew}
          disabled={isSuperadmin && !superadminCity}
          style={{
            padding: '10px 18px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontWeight: 600,
            cursor: isSuperadmin && !superadminCity ? 'not-allowed' : 'pointer',
            fontSize: 14,
            opacity: isSuperadmin && !superadminCity ? 0.55 : 1,
          }}
        >
          Nova forma
        </button>
      </div>

      {isSuperadmin && !superadminCity && (
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
          Odaberite grad za upravljanje obrascima.
        </p>
      )}

      {successMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: 'color-mix(in srgb, #16a34a 18%, transparent)',
            color: 'var(--text-primary)',
            fontSize: 14,
          }}
        >
          {successMessage}
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            style={{
              marginLeft: 12,
              background: 'transparent',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: 13,
            }}
          >
            Zatvori
          </button>
        </div>
      )}

      {listError && (
        <div style={{ color: '#ef4444', fontSize: 14 }}>{listError}</div>
      )}

      <section
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: 20,
          overflowX: 'auto',
        }}
      >
        {loading && <div style={{ color: 'var(--text-secondary)' }}>Učitavanje...</div>}
        {!loading && sortedItems.length === 0 && (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Još nema definiranih obrazaca.</p>
        )}
        {!loading && sortedItems.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-color)' }}>Naziv</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-color)' }}>Slug</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-color)' }}>Status</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-color)' }}>Broj polja</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-color)' }} />
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((row) => (
                <tr key={row.id} style={{ color: 'var(--text-primary)' }}>
                  <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>{row.name}</td>
                  <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)', fontFamily: 'monospace', fontSize: 13 }}>
                    {row.slug}
                  </td>
                  <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ToggleSwitch
                        checked={row.is_active}
                        disabled={Boolean(toggleBusy[row.id])}
                        onChange={() => void handleListToggleActive(row.id, row.is_active)}
                      />
                      <span style={{ fontSize: 13 }}>{row.is_active ? 'Aktivan' : 'Neaktivan'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>
                    {row.fields.length}
                  </td>
                  <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => openEdit(row.id)}
                      style={{
                        marginRight: 8,
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-card-hover)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Uredi
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row.id, row.name)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid color-mix(in srgb, #dc2626 35%, var(--border-color))',
                        background: 'transparent',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Obriši
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {builderOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'rgba(0,0,0,0.45)',
          }}
          role="presentation"
          onClick={closeBuilder}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-builder-title"
            style={{
              width: 'min(640px, 100%)',
              height: '100%',
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border-color)',
              boxShadow: '-8px 0 24px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h3 id="form-builder-title" style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
                {editingId ? 'Uredi obrazac' : 'Nova forma'} — {stepTitle(step)}
              </h3>
              <button
                type="button"
                onClick={closeBuilder}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 22,
                  lineHeight: 1,
                }}
                aria-label="Zatvori"
              >
                ×
              </button>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStep(n)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: n === step ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                      background: n === step ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {n}. {stepTitle(n)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {saveError && (
                <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: 'color-mix(in srgb, #dc2626 15%, transparent)', color: '#fecaca', fontSize: 14 }}>
                  {saveError}
                </div>
              )}

              {step === 1 && (
                <form style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-primary)', fontSize: 14 }}>
                    Naziv *
                    <input
                      required
                      value={draft.name}
                      onChange={(e) => onNameChange(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: 14,
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-primary)', fontSize: 14 }}>
                    Slug *
                    <input
                      required
                      value={draft.slug}
                      onChange={(e) => onSlugChange(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                        fontSize: 14,
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-primary)', fontSize: 14 }}>
                    Opis
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      rows={4}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: 14,
                        resize: 'vertical',
                      }}
                    />
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="submit" style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                      Dalje
                    </button>
                  </div>
                </form>
              )}

              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
                    Dodajte i poredajte polja koja građanin ispunjava u widgetu.
                  </p>
                  {draft.fields.map((f, index) => (
                    <div
                      key={f.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: 12,
                        alignItems: 'center',
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                      }}
                    >
                      <div
                        title="Rukovanje za poredak"
                        style={{
                          color: 'var(--text-secondary)',
                          cursor: 'grab',
                          fontSize: 18,
                          lineHeight: 1,
                          userSelect: 'none',
                        }}
                      >
                        ⋮⋮
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{f.label || '(bez oznake)'}</div>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: 12,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'var(--badge-bg)',
                            color: 'var(--badge-text)',
                          }}
                        >
                          {typeBadgeLabel(f.type)}
                        </span>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Obavezno</span>
                          <ToggleSwitch checked={f.required} onChange={() => toggleFieldRequired(index)} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => moveField(index, -1)}
                          disabled={index === 0}
                          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card-hover)', cursor: index === 0 ? 'not-allowed' : 'pointer' }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveField(index, 1)}
                          disabled={index === draft.fields.length - 1}
                          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card-hover)', cursor: index === draft.fields.length - 1 ? 'not-allowed' : 'pointer' }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeField(index)}
                          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid color-mix(in srgb, #dc2626 35%, var(--border-color))', background: 'transparent', color: '#f87171', cursor: 'pointer' }}
                        >
                          Ukloni
                        </button>
                      </div>
                    </div>
                  ))}

                  {!fieldFormOpen && (
                    <button
                      type="button"
                      onClick={openAddFieldForm}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px dashed var(--border-color)',
                        background: 'transparent',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Dodaj polje
                    </button>
                  )}

                  {fieldFormOpen && (
                    <form
                      onSubmit={addFieldFromForm}
                      style={{
                        padding: 16,
                        borderRadius: 10,
                        border: '1px solid var(--accent)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Novo polje</div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                        Oznaka (label) *
                        <input
                          required
                          value={fieldForm.label}
                          onChange={(e) => setFieldForm((s) => ({ ...s, label: e.target.value }))}
                          style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                        Tip
                        <select
                          value={fieldForm.type}
                          onChange={(e) =>
                            setFieldForm((s) => ({
                              ...s,
                              type: e.target.value as FormDefinitionFieldType,
                            }))
                          }
                          style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        Obavezno
                        <ToggleSwitch
                          checked={fieldForm.required}
                          onChange={() => setFieldForm((s) => ({ ...s, required: !s.required }))}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                        Placeholder
                        <input
                          value={fieldForm.placeholder}
                          onChange={(e) => setFieldForm((s) => ({ ...s, placeholder: e.target.value }))}
                          style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        />
                      </label>
                      {fieldForm.type === 'select' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <span style={{ fontSize: 14 }}>Opcije</span>
                          {fieldForm.options.map((opt, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8 }}>
                              <input
                                value={opt}
                                onChange={(e) =>
                                  setFieldForm((s) => ({
                                    ...s,
                                    options: s.options.map((o, j) => (j === i ? e.target.value : o)),
                                  }))
                                }
                                placeholder={`Opcija ${i + 1}`}
                                style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setFieldForm((s) => ({
                                    ...s,
                                    options: s.options.filter((_, j) => j !== i),
                                  }))
                                }
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card-hover)', cursor: 'pointer' }}
                              >
                                −
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setFieldForm((s) => ({ ...s, options: [...s.options, ''] }))}
                            style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--accent)' }}
                          >
                            Dodaj opciju
                          </button>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setFieldFormOpen(false)}
                          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          Odustani
                        </button>
                        <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                          Dodaj polje
                        </button>
                      </div>
                    </form>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <button type="button" onClick={() => setStep(1)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Natrag
                    </button>
                    <button type="button" onClick={() => setStep(3)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                      Dalje
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {draft.required_attachments.map((a, index) => (
                    <div
                      key={a.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</div>
                      {a.description && (
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{a.description}</div>
                      )}
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Obavezno</span>
                        <ToggleSwitch checked={a.required} onChange={() => toggleAttachmentRequired(index)} />
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, #dc2626 35%, var(--border-color))', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: 13 }}
                        >
                          Ukloni
                        </button>
                      </div>
                    </div>
                  ))}

                  {!attachmentFormOpen && (
                    <button
                      type="button"
                      onClick={openAddAttachmentForm}
                      style={{
                        alignSelf: 'flex-start',
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px dashed var(--border-color)',
                        background: 'transparent',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Dodaj prilog
                    </button>
                  )}

                  {attachmentFormOpen && (
                    <form
                      onSubmit={addAttachmentFromForm}
                      style={{
                        padding: 16,
                        borderRadius: 10,
                        border: '1px solid var(--accent)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>Novi prilog</div>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                        Oznaka *
                        <input
                          required
                          value={attachmentForm.label}
                          onChange={(e) => setAttachmentForm((s) => ({ ...s, label: e.target.value }))}
                          style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                        Opis
                        <input
                          value={attachmentForm.description}
                          onChange={(e) => setAttachmentForm((s) => ({ ...s, description: e.target.value }))}
                          style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        Obavezno
                        <ToggleSwitch
                          checked={attachmentForm.required}
                          onChange={() => setAttachmentForm((s) => ({ ...s, required: !s.required }))}
                        />
                      </label>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setAttachmentFormOpen(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--text-primary)' }}>
                          Odustani
                        </button>
                        <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                          Dodaj prilog
                        </button>
                      </div>
                    </form>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" onClick={() => setStep(2)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Natrag
                    </button>
                    <button type="button" onClick={() => setStep(4)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                      Dalje
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                      Nazivi dokumenata koji aktiviraju CTA u widgetu
                    </div>
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Upišite naziv datoteke bez ekstenzije (npr. jednokratna_novcana_pomoc). Kada AI odgovori koristeći taj dokument, građaninu će se prikazati gumb za ispunjavanje ovog obrasca.
                    </p>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                    {draft.trigger_doc_slugs.map((s) => (
                      <li
                        key={s}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          marginBottom: 8,
                          borderRadius: 8,
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          fontFamily: 'monospace',
                          fontSize: 14,
                        }}
                      >
                        {s}
                        <button type="button" onClick={() => removeTrigger(s)} style={{ border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer' }}>
                          Ukloni
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={newTriggerInput}
                      onChange={(e) => setNewTriggerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTriggerSlug();
                        }
                      }}
                      placeholder="npr. jednokratna_novcana_pomoc"
                      style={{
                        flex: 1,
                        minWidth: 200,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontFamily: 'monospace',
                      }}
                    />
                    <button
                      type="button"
                      onClick={addTriggerSlug}
                      style={{
                        padding: '10px 18px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--accent)',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Dodaj
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" onClick={() => setStep(3)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Natrag
                    </button>
                    <button type="button" onClick={() => setStep(5)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                      Dalje
                    </button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6 }}>
                    <div style={{ marginBottom: 12 }}>
                      <strong>Osnovni podaci:</strong> {draft.name} ({draft.slug})
                    </div>
                    {draft.description && (
                      <div style={{ marginBottom: 12 }}>
                        <strong>Opis:</strong> {draft.description}
                      </div>
                    )}
                    <div style={{ marginBottom: 12 }}>
                      <strong>Polja ({draft.fields.length}):</strong>
                      <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                        {draft.fields.map((f) => (
                          <li key={f.id}>
                            {f.label} — {typeBadgeLabel(f.type)}
                            {f.required ? ' (obavezno)' : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <strong>Prilozi ({draft.required_attachments.length}):</strong>
                      <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                        {draft.required_attachments.length === 0 && <li>Nema</li>}
                        {draft.required_attachments.map((a) => (
                          <li key={a.id}>
                            {a.label}
                            {a.required ? ' (obavezno)' : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Trigger dokumenti:</strong>{' '}
                      {draft.trigger_doc_slugs.length === 0 ? 'Nema' : draft.trigger_doc_slugs.join(', ')}
                    </div>
                    {editingId && (
                      <div style={{ marginTop: 12 }}>
                        <strong>Status u obrascu:</strong> {draft.is_active ? 'Aktivan' : 'Neaktivan'}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <button type="button" onClick={() => setStep(4)} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Natrag
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        padding: '10px 24px',
                        borderRadius: 8,
                        border: 'none',
                        background: saving ? 'var(--text-secondary)' : 'var(--accent)',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saving ? 'Spremanje…' : 'Spremi'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
