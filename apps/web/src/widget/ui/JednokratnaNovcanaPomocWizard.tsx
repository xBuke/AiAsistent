import React, { useState, useCallback, useEffect } from 'react';
import { t } from '../i18n';

/** Single uploaded attachment (from API response) */
export interface JednokratnaAttachmentItem {
  id: string;
  stored_filename: string;
  category_key: string;
  category_label?: string;
  size_bytes?: number;
  mime_type?: string;
  created_at?: string;
}

export interface JednokratnaNovcanaPomocFormData {
  podnositelj: {
    ime_prezime: string;
    adresa: string;
    kontakt: string;
  };
  identifikacija: {
    oib: string;
    iban: string;
  };
  razlog_zamolbe: string;
  okolnosti: {
    zdravstveni_razlog: boolean | null;
    gubitak_prihoda: boolean | null;
    podstanar: boolean | null;
  };
  meta: {
    mjesto_podnosenja: string;
    datum_podnosenja: string;
  };
  draftReferenceNumber?: string;
  draftFormRequestId?: string;
  attachments?: {
    enabledCategories: Record<string, boolean>;
    uploaded: JednokratnaAttachmentItem[];
    errors?: Record<string, string>;
  };
}

const DEFAULT_MJESTO = 'Ploče';
const RAZLOG_MIN_LENGTH = 20;

function todayCroatian(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}.`;
}

export function getDefaultJednokratnaData(): JednokratnaNovcanaPomocFormData {
  return {
    podnositelj: { ime_prezime: '', adresa: '', kontakt: '' },
    identifikacija: { oib: '', iban: '' },
    razlog_zamolbe: '',
    okolnosti: {
      zdravstveni_razlog: null,
      gubitak_prihoda: null,
      podstanar: null,
    },
    meta: { mjesto_podnosenja: DEFAULT_MJESTO, datum_podnosenja: todayCroatian() },
    attachments: { enabledCategories: {}, uploaded: [] },
  };
}

const MAX_ATTACHMENTS_TOTAL = 10;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_J = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const JEDNOKRATNA_ATTACHMENT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'osobni_dokumenti', label: 'Osobni dokumenti (OI/rodni listovi kućanstva)' },
  { key: 'izjava_kucanstvo', label: 'Izjava o članovima kućanstva' },
  { key: 'dokaz_primanja', label: 'Dokaz o primanjima (zadnja 3 mjeseca)' },
  { key: 'porezna_potvrda', label: 'Porezna potvrda (ako primjenjivo)' },
  { key: 'potvrda_poslodavac', label: 'Potvrda poslodavca / HZZ / mirovina (ako primjenjivo)' },
  { key: 'ugovor_najam', label: 'Ugovor o najmu/podstanarstvu (ako primjenjivo)' },
  { key: 'lijecnicka', label: 'Liječnička dokumentacija (ako primjenjivo)' },
  { key: 'ostalo', label: 'Ostalo' },
];

const OIB_REGEX = /^\d{11}$/;
const IBAN_MIN_LENGTH = 15;

function validateStep1(data: JednokratnaNovcanaPomocFormData): boolean {
  const { ime_prezime, adresa, kontakt } = data.podnositelj;
  return !!ime_prezime?.trim() && !!adresa?.trim() && !!kontakt?.trim();
}

function validateStep2(data: JednokratnaNovcanaPomocFormData): boolean {
  const { oib, iban } = data.identifikacija;
  return (
    OIB_REGEX.test((oib || '').trim()) &&
    (iban || '').trim().startsWith('HR') &&
    (iban || '').trim().length >= IBAN_MIN_LENGTH
  );
}

function validateStep3(data: JednokratnaNovcanaPomocFormData): boolean {
  const r = (data.razlog_zamolbe || '').trim();
  return r.length >= RAZLOG_MIN_LENGTH;
}

function validateStep5(data: JednokratnaNovcanaPomocFormData): boolean {
  const { zdravstveni_razlog, gubitak_prihoda, podstanar } = data.okolnosti;
  return (
    zdravstveni_razlog !== null &&
    gubitak_prihoda !== null &&
    podstanar !== null
  );
}

function validateAttachmentsStep(data: JednokratnaNovcanaPomocFormData): boolean {
  if (!data.draftReferenceNumber) return false;
  const uploaded = data.attachments?.uploaded ?? [];
  if (uploaded.length > MAX_ATTACHMENTS_TOTAL) return false;
  const enabled = data.attachments?.enabledCategories ?? {};
  for (const key of Object.keys(enabled)) {
    if (enabled[key] && !uploaded.some((u) => u.category_key === key)) return false;
  }
  return true;
}

interface JednokratnaNovcanaPomocWizardProps {
  lang?: string;
  primaryColor?: string;
  step: number;
  data: JednokratnaNovcanaPomocFormData;
  onStepChange: (step: number) => void;
  onDataChange: (data: JednokratnaNovcanaPomocFormData) => void;
  onSubmit?: (data: JednokratnaNovcanaPomocFormData) => Promise<{ reference_number?: string; error?: string }>;
  onSuccess?: (referenceNumber: string) => void;
  onOdustani?: () => void;
  apiBaseUrl?: string;
  citySlug?: string;
}

const JednokratnaNovcanaPomocWizard: React.FC<JednokratnaNovcanaPomocWizardProps> = ({
  lang,
  primaryColor = '#0b3a6e',
  step,
  data,
  onStepChange,
  onDataChange,
  onSubmit,
  onSuccess,
  onOdustani,
  apiBaseUrl,
  citySlug,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSummary5, setShowSummary5] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showOdustaniConfirm, setShowOdustaniConfirm] = useState(false);
  const [showNoAttachmentsConfirm, setShowNoAttachmentsConfirm] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);

  const update = useCallback(
    (slice: Partial<JednokratnaNovcanaPomocFormData>) => {
      onDataChange({ ...data, ...slice });
      setErrors({});
    },
    [data, onDataChange]
  );

  const canGoNext = (): boolean => {
    if (step === 1) return validateStep1(data);
    if (step === 2) return validateStep2(data);
    if (step === 3) return validateStep3(data);
    if (step === 4) return validateAttachmentsStep(data);
    if (step === 5) return validateStep5(data);
    return false;
  };

  const createDraft = useCallback(async () => {
    if (!apiBaseUrl?.trim() || !citySlug?.trim() || data.draftReferenceNumber) return;
    setDraftError(null);
    setDraftLoading(true);
    const url = `${apiBaseUrl.replace(/\/$/, '')}/forms/draft`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city_slug: citySlug, type: 'jednokratna_novcana_pomoc', data_json: {} }),
      });
      const json = (await res.json().catch(() => ({}))) as { form_request_id?: string; reference_number?: string; status?: string; error?: string };
      if (res.ok && json.reference_number) {
        onDataChange({
          ...data,
          draftReferenceNumber: json.reference_number,
          draftFormRequestId: json.form_request_id,
          attachments: { ...data.attachments, enabledCategories: data.attachments?.enabledCategories ?? {}, uploaded: data.attachments?.uploaded ?? [] },
        });
      } else {
        setDraftError(json.error || t(lang, 'attachmentsDraftError'));
      }
    } catch {
      setDraftError(t(lang, 'attachmentsDraftError'));
    } finally {
      setDraftLoading(false);
    }
  }, [apiBaseUrl, citySlug, data, lang, onDataChange]);

  useEffect(() => {
    if (step === 4 && !data.draftReferenceNumber && apiBaseUrl?.trim() && citySlug?.trim() && !draftLoading) {
      createDraft();
    }
  }, [step, data.draftReferenceNumber, apiBaseUrl, citySlug, draftLoading, createDraft]);

  const uploadFile = useCallback(
    async (categoryKey: string, categoryLabel: string, file: File) => {
      const ref = data.draftReferenceNumber;
      if (!ref || !apiBaseUrl?.trim()) return;
      if (!ALLOWED_MIME_J.includes(file.type as any)) return;
      if (file.size > MAX_FILE_SIZE_BYTES) return;
      const uploaded = data.attachments?.uploaded ?? [];
      if (uploaded.length >= MAX_ATTACHMENTS_TOTAL) return;
      setUploadingCategory(categoryKey);
      const url = `${apiBaseUrl.replace(/\/$/, '')}/forms/${encodeURIComponent(ref)}/attachments`;
      const form = new FormData();
      form.append('category_key', categoryKey);
      form.append('category_label', categoryLabel);
      form.append('file', file);
      try {
        const res = await fetch(url, { method: 'POST', body: form });
        const json = (await res.json().catch(() => ({}))) as { id?: string; stored_filename?: string; category_key?: string; created_at?: string; error?: string };
        if (res.ok && json.id) {
          onDataChange({
            ...data,
            attachments: {
              ...data.attachments,
              enabledCategories: data.attachments?.enabledCategories ?? {},
              uploaded: [...(data.attachments?.uploaded ?? []), { id: json.id, stored_filename: json.stored_filename ?? '', category_key: json.category_key ?? categoryKey, created_at: json.created_at }],
              errors: { ...data.attachments?.errors, [categoryKey]: '' },
            },
          });
        } else {
          onDataChange({
            ...data,
            attachments: {
              ...data.attachments,
              enabledCategories: data.attachments?.enabledCategories ?? {},
              uploaded: data.attachments?.uploaded ?? [],
              errors: { ...data.attachments?.errors, [categoryKey]: json.error || t(lang, 'attachmentsUploadError') },
            },
          });
        }
      } catch {
        onDataChange({
          ...data,
          attachments: {
            ...data.attachments,
            enabledCategories: data.attachments?.enabledCategories ?? {},
            uploaded: data.attachments?.uploaded ?? [],
            errors: { ...data.attachments?.errors, [categoryKey]: t(lang, 'attachmentsUploadError') },
          },
        });
      } finally {
        setUploadingCategory(null);
      }
    },
    [data, apiBaseUrl, lang, onDataChange]
  );

  const validateCurrent = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (!(data.podnositelj.ime_prezime || '').trim())
        e.ime_prezime = t(lang, 'jednokratnaErrorRequired');
      if (!(data.podnositelj.adresa || '').trim())
        e.adresa = t(lang, 'jednokratnaErrorRequired');
      if (!(data.podnositelj.kontakt || '').trim())
        e.kontakt = t(lang, 'jednokratnaErrorRequired');
    }
    if (step === 2) {
      const oib = (data.identifikacija.oib || '').trim();
      const iban = (data.identifikacija.iban || '').trim();
      if (!OIB_REGEX.test(oib)) e.oib = t(lang, 'jednokratnaErrorOib');
      if (!iban.startsWith('HR') || iban.length < IBAN_MIN_LENGTH)
        e.iban = t(lang, 'jednokratnaErrorIban');
    }
    if (step === 3) {
      const r = (data.razlog_zamolbe || '').trim();
      if (r.length < RAZLOG_MIN_LENGTH)
        e.razlog_zamolbe = t(lang, 'jednokratnaErrorRazlog');
    }
    if (step === 4) {
      if (!data.draftReferenceNumber) return false;
      const uploaded = data.attachments?.uploaded ?? [];
      if (uploaded.length > MAX_ATTACHMENTS_TOTAL) return false;
      const enabled = data.attachments?.enabledCategories ?? {};
      for (const key of Object.keys(enabled)) {
        if (enabled[key] && !uploaded.some((u) => u.category_key === key)) {
          e.attachments = t(lang, 'attachmentsCategoryRequired');
          break;
        }
      }
    }
    if (step === 5) {
      if (data.okolnosti.zdravstveni_razlog === null)
        e.zdravstveni_razlog = t(lang, 'jednokratnaErrorRequired');
      if (data.okolnosti.gubitak_prihoda === null)
        e.gubitak_prihoda = t(lang, 'jednokratnaErrorRequired');
      if (data.okolnosti.podstanar === null)
        e.podstanar = t(lang, 'jednokratnaErrorRequired');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validateCurrent()) return;
    if (step < 5) {
      onStepChange(step + 1);
      if (step + 1 === 5) setShowSummary5(false);
    } else if (step === 5) {
      setShowSummary5(true);
    }
  };

  const handleBack = () => {
    if (step === 5 && showSummary5) {
      setShowSummary5(false);
      setErrors({});
      setSubmitError(null);
      return;
    }
    if (step > 1) {
      onStepChange(step - 1);
      if (step - 1 === 5) setShowSummary5(false);
    }
    setErrors({});
    setSubmitError(null);
  };

  const handleOdustaniClick = () => {
    if (!onOdustani) return;
    setShowOdustaniConfirm(true);
  };

  const handleOdustaniConfirm = () => {
    setShowOdustaniConfirm(false);
    onOdustani?.();
  };

  const doSubmit = () => {
    if (!onSubmit) return;
    setSubmitError(null);
    setIsSubmitting(true);
    onSubmit(data)
      .then((result) => {
        if (result.reference_number && onSuccess) {
          onSuccess(result.reference_number);
        } else if (result.error) {
          setSubmitError(result.error);
          setIsSubmitting(false);
        } else {
          setIsSubmitting(false);
        }
      })
      .catch(() => {
        setSubmitError(t(lang, 'jednokratnaSubmitError'));
        setIsSubmitting(false);
      });
  };

  const handleSendRequest = () => {
    if (step !== 5 || !validateStep5(data) || isSubmitting) return;
    if (!onSubmit) return;
    const totalAttachments = (data.attachments?.uploaded ?? []).length;
    if (totalAttachments === 0) {
      setShowNoAttachmentsConfirm(true);
      return;
    }
    doSubmit();
  };

  const baseStyle = {
    marginTop: '12px',
    padding: '14px 16px',
    borderRadius: '12px',
    backgroundColor: '#f0f4f8',
    border: '1px solid #e0e6ed',
    fontSize: '14px',
    color: '#333',
  } as const;

  const inputStyle = (hasError: boolean) =>
    ({
      width: '100%',
      padding: '8px 12px',
      border: hasError ? '1px solid #d32f2f' : '1px solid #ddd',
      borderRadius: '8px',
      fontSize: '14px',
      fontFamily: 'inherit',
      outline: 'none',
      boxSizing: 'border-box' as const,
    }) as const;

  const labelStyle = {
    display: 'block' as const,
    marginBottom: '4px',
    fontSize: '14px',
    color: '#333',
    fontWeight: 500,
  };

  const progressStyle = {
    marginBottom: '12px',
    fontSize: '13px',
    color: '#666',
  };

  const buttonRowStyle = {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
    flexWrap: 'wrap' as const,
  };

  const buttonBase = {
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
  } as const;

  const isSummary = step === 5 && showSummary5;
  const canSubmit = !!onSubmit;

  return (
    <div style={baseStyle}>
      <div style={progressStyle}>
        {t(lang, 'jednokratnaStep')} {step} / 5
      </div>

      {step === 1 && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'jednokratnaImePrezime')} *</label>
            <input
              type="text"
              value={data.podnositelj.ime_prezime}
              onChange={(e) =>
                update({
                  podnositelj: { ...data.podnositelj, ime_prezime: e.target.value },
                })
              }
              placeholder={t(lang, 'jednokratnaImePrezimePlaceholder')}
              style={inputStyle(!!errors.ime_prezime)}
            />
            {errors.ime_prezime && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.ime_prezime}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'jednokratnaAdresa')} *</label>
            <input
              type="text"
              value={data.podnositelj.adresa}
              onChange={(e) =>
                update({ podnositelj: { ...data.podnositelj, adresa: e.target.value } })
              }
              placeholder={t(lang, 'jednokratnaAdresaPlaceholder')}
              style={inputStyle(!!errors.adresa)}
            />
            {errors.adresa && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.adresa}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'jednokratnaKontakt')} *</label>
            <input
              type="text"
              value={data.podnositelj.kontakt}
              onChange={(e) =>
                update({ podnositelj: { ...data.podnositelj, kontakt: e.target.value } })
              }
              placeholder={t(lang, 'jednokratnaKontaktPlaceholder')}
              style={inputStyle(!!errors.kontakt)}
            />
            {errors.kontakt && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.kontakt}
              </div>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'jednokratnaOib')} *</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={11}
              value={data.identifikacija.oib}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 11);
                update({
                  identifikacija: { ...data.identifikacija, oib: v },
                });
              }}
              placeholder="11 znamenki"
              style={inputStyle(!!errors.oib)}
            />
            {errors.oib && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.oib}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'jednokratnaIban')} *</label>
            <input
              type="text"
              value={data.identifikacija.iban}
              onChange={(e) =>
                update({
                  identifikacija: { ...data.identifikacija, iban: e.target.value },
                })
              }
              placeholder="HR..."
              style={inputStyle(!!errors.iban)}
            />
            {errors.iban && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.iban}
              </div>
            )}
          </div>
        </>
      )}

      {step === 3 && (
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>{t(lang, 'jednokratnaRazlogZamolbe')} *</label>
          <textarea
            value={data.razlog_zamolbe}
            onChange={(e) => update({ razlog_zamolbe: e.target.value })}
            placeholder={t(lang, 'jednokratnaRazlogPlaceholder')}
            rows={4}
            style={{
              ...inputStyle(!!errors.razlog_zamolbe),
              resize: 'vertical',
              minHeight: '80px',
            }}
          />
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
            {(data.razlog_zamolbe || '').trim().length} / {RAZLOG_MIN_LENGTH}
          </div>
          {errors.razlog_zamolbe && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
              {errors.razlog_zamolbe}
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <>
          <div style={{ marginBottom: '8px', fontWeight: 600 }}>{t(lang, 'attachmentsStepTitle')}</div>
          <div style={{ marginBottom: '8px', fontSize: '13px', color: '#666' }}>
            {t(lang, 'attachmentsFilesCount').replace('{count}', String((data.attachments?.uploaded ?? []).length))}
          </div>
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>{t(lang, 'attachmentsMaxSize')}</div>
          {!data.draftReferenceNumber && apiBaseUrl && citySlug && (
            <div style={{ marginBottom: '12px' }}>
              {draftError && (
                <div style={{ marginBottom: '8px', padding: '8px 12px', backgroundColor: '#ffebee', borderRadius: '8px', fontSize: '13px', color: '#c62828' }}>
                  {draftError}
                </div>
              )}
              <button type="button" onClick={createDraft} disabled={draftLoading} style={{ ...buttonBase, backgroundColor: primaryColor, color: 'white' }}>
                {draftLoading ? '...' : t(lang, 'attachmentsDraftRetry')}
              </button>
            </div>
          )}
          {errors.attachments && (
            <div style={{ marginBottom: '8px', padding: '8px 12px', backgroundColor: '#ffebee', borderRadius: '8px', fontSize: '13px', color: '#c62828' }}>
              {errors.attachments}
            </div>
          )}
          {data.draftReferenceNumber && (
            <div style={{ marginBottom: '12px' }}>
              {(data.attachments?.uploaded ?? []).length >= MAX_ATTACHMENTS_TOTAL && (
                <div style={{ marginBottom: '8px', fontSize: '12px', color: '#c62828' }}>{t(lang, 'attachmentsLimitReached')}</div>
              )}
              <div style={{ marginBottom: '6px', fontSize: '12px', color: '#666' }}>{t(lang, 'attachmentsInvalidFileTypeOrSize')}</div>
              {JEDNOKRATNA_ATTACHMENT_CATEGORIES.map(({ key, label }) => {
                const enabled = (data.attachments?.enabledCategories ?? {})[key] ?? false;
                const categoryUploaded = (data.attachments?.uploaded ?? []).filter((u) => u.category_key === key);
                const err = (data.attachments?.errors ?? {})[key];
                const isUploading = uploadingCategory === key;
                const categoryMissingFile = enabled && categoryUploaded.length === 0;
                return (
                  <div key={key} style={{ marginBottom: '14px', padding: '10px 12px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e0e6ed' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '6px' }}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          onDataChange({
                            ...data,
                            attachments: {
                              ...data.attachments,
                              enabledCategories: { ...(data.attachments?.enabledCategories ?? {}), [key]: e.target.checked },
                              uploaded: data.attachments?.uploaded ?? [],
                            },
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                    {enabled && (
                      <>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          multiple
                          style={{ marginTop: '6px', fontSize: '13px' }}
                          disabled={isUploading || (data.attachments?.uploaded ?? []).length >= MAX_ATTACHMENTS_TOTAL}
                          onChange={(e) => {
                            const files = e.target.files;
                            if (!files?.length) return;
                            const total = (data.attachments?.uploaded ?? []).length;
                            let hasInvalid = false;
                            for (let i = 0; i < files.length && total + i < MAX_ATTACHMENTS_TOTAL; i++) {
                              const file = files[i];
                              if (file.size > MAX_FILE_SIZE_BYTES || !ALLOWED_MIME_J.includes(file.type as any)) {
                                hasInvalid = true;
                                continue;
                              }
                              uploadFile(key, label, file);
                            }
                            if (hasInvalid) {
                              onDataChange({
                                ...data,
                                attachments: {
                                  ...data.attachments,
                                  enabledCategories: data.attachments?.enabledCategories ?? {},
                                  uploaded: data.attachments?.uploaded ?? [],
                                  errors: { ...data.attachments?.errors, [key]: t(lang, 'attachmentsInvalidFileTypeOrSize') },
                                },
                              });
                            }
                            e.target.value = '';
                          }}
                        />
                        {categoryUploaded.length > 0 && (
                          <ul style={{ margin: '8px 0 0', paddingLeft: '20px', fontSize: '13px', color: '#333' }}>
                            {categoryUploaded.map((u) => (
                              <li key={u.id}>{u.stored_filename}</li>
                            ))}
                          </ul>
                        )}
                        {categoryMissingFile && (
                          <div style={{ marginTop: '4px', fontSize: '12px', color: '#c62828' }}>{t(lang, 'attachmentsInvalidCategory')}</div>
                        )}
                        {err && !categoryMissingFile && <div style={{ marginTop: '4px', fontSize: '12px', color: '#c62828' }}>{err}</div>}
                        {isUploading && <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>Prijenos...</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {step === 5 && !isSummary && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'jednokratnaZdravstveniRazlog')} *</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="zdravstveni_razlog"
                  checked={data.okolnosti.zdravstveni_razlog === true}
                  onChange={() =>
                    update({
                      okolnosti: {
                        ...data.okolnosti,
                        zdravstveni_razlog: true,
                      },
                    })
                  }
                />
                {t(lang, 'jednokratnaYes')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="zdravstveni_razlog"
                  checked={data.okolnosti.zdravstveni_razlog === false}
                  onChange={() =>
                    update({
                      okolnosti: {
                        ...data.okolnosti,
                        zdravstveni_razlog: false,
                      },
                    })
                  }
                />
                {t(lang, 'jednokratnaNo')}
              </label>
            </div>
            {errors.zdravstveni_razlog && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.zdravstveni_razlog}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'jednokratnaGubitakPrihoda')} *</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="gubitak_prihoda"
                  checked={data.okolnosti.gubitak_prihoda === true}
                  onChange={() =>
                    update({
                      okolnosti: {
                        ...data.okolnosti,
                        gubitak_prihoda: true,
                      },
                    })
                  }
                />
                {t(lang, 'jednokratnaYes')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="gubitak_prihoda"
                  checked={data.okolnosti.gubitak_prihoda === false}
                  onChange={() =>
                    update({
                      okolnosti: {
                        ...data.okolnosti,
                        gubitak_prihoda: false,
                      },
                    })
                  }
                />
                {t(lang, 'jednokratnaNo')}
              </label>
            </div>
            {errors.gubitak_prihoda && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.gubitak_prihoda}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'jednokratnaPodstanar')} *</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="podstanar"
                  checked={data.okolnosti.podstanar === true}
                  onChange={() =>
                    update({
                      okolnosti: {
                        ...data.okolnosti,
                        podstanar: true,
                      },
                    })
                  }
                />
                {t(lang, 'jednokratnaYes')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="podstanar"
                  checked={data.okolnosti.podstanar === false}
                  onChange={() =>
                    update({
                      okolnosti: {
                        ...data.okolnosti,
                        podstanar: false,
                      },
                    })
                  }
                />
                {t(lang, 'jednokratnaNo')}
              </label>
            </div>
            {errors.podstanar && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.podstanar}
              </div>
            )}
          </div>
        </>
      )}

      {step === 5 && isSummary && submitError && (
        <div style={{ marginBottom: '12px', padding: '8px 12px', backgroundColor: '#ffebee', borderRadius: '8px', fontSize: '13px', color: '#c62828' }}>
          {submitError}
        </div>
      )}

      {step === 5 && isSummary && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 600 }}>
            {t(lang, 'jednokratnaSummaryTitle')}
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
            <div><strong>{t(lang, 'jednokratnaImePrezime')}:</strong> {data.podnositelj.ime_prezime}</div>
            <div><strong>{t(lang, 'jednokratnaAdresa')}:</strong> {data.podnositelj.adresa}</div>
            <div><strong>{t(lang, 'jednokratnaKontakt')}:</strong> {data.podnositelj.kontakt}</div>
            <div><strong>{t(lang, 'jednokratnaOib')}:</strong> {data.identifikacija.oib}</div>
            <div><strong>{t(lang, 'jednokratnaIban')}:</strong> {data.identifikacija.iban}</div>
            <div><strong>{t(lang, 'jednokratnaRazlogZamolbe')}:</strong> {data.razlog_zamolbe.trim()}</div>
            <div><strong>{t(lang, 'jednokratnaZdravstveniRazlog')}:</strong> {data.okolnosti.zdravstveni_razlog ? t(lang, 'jednokratnaYes') : t(lang, 'jednokratnaNo')}</div>
            <div><strong>{t(lang, 'jednokratnaGubitakPrihoda')}:</strong> {data.okolnosti.gubitak_prihoda ? t(lang, 'jednokratnaYes') : t(lang, 'jednokratnaNo')}</div>
            <div><strong>{t(lang, 'jednokratnaPodstanar')}:</strong> {data.okolnosti.podstanar ? t(lang, 'jednokratnaYes') : t(lang, 'jednokratnaNo')}</div>
            <div><strong>{t(lang, 'jednokratnaMjestoPodnosenja')}:</strong> {data.meta.mjesto_podnosenja}</div>
            <div><strong>{t(lang, 'jednokratnaDatumPodnosenja')}:</strong> {data.meta.datum_podnosenja}</div>
          </div>
        </div>
      )}

      {showOdustaniConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowOdustaniConfirm(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '12px',
              maxWidth: '320px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 16px', fontSize: '14px' }}>{t(lang, 'jednokratnaOdustaniConfirm')}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowOdustaniConfirm(false)}
                style={{ ...buttonBase, backgroundColor: '#f0f4f8', color: '#333', border: '1px solid #ccc' }}
              >
                {t(lang, 'jednokratnaNastavi')}
              </button>
              <button
                type="button"
                onClick={handleOdustaniConfirm}
                style={{ ...buttonBase, backgroundColor: '#c62828', color: 'white' }}
              >
                {t(lang, 'jednokratnaOdustani')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoAttachmentsConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowNoAttachmentsConfirm(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '12px',
              maxWidth: '320px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: '8px', fontWeight: 600, fontSize: '15px' }}>{t(lang, 'noAttachmentsTitle')}</div>
            <p style={{ margin: '0 0 16px', fontSize: '14px' }}>{t(lang, 'noAttachmentsBody')}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowNoAttachmentsConfirm(false)}
                style={{ ...buttonBase, backgroundColor: '#f0f4f8', color: '#333', border: '1px solid #ccc' }}
              >
                {t(lang, 'noAttachmentsCancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNoAttachmentsConfirm(false);
                  doSubmit();
                }}
                style={{ ...buttonBase, backgroundColor: primaryColor, color: 'white' }}
              >
                {t(lang, 'noAttachmentsSendAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={buttonRowStyle}>
        {step > 1 && !(step === 5 && showSummary5) && (
          <button
            type="button"
            onClick={handleBack}
            style={{
              ...buttonBase,
              backgroundColor: 'transparent',
              color: '#666',
              border: '1px solid #ccc',
            }}
          >
            {t(lang, 'jednokratnaBack')}
          </button>
        )}
        {step < 5 && (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext()}
            style={{
              ...buttonBase,
              backgroundColor: canGoNext() ? primaryColor : '#ccc',
              color: 'white',
              opacity: canGoNext() ? 1 : 0.7,
            }}
          >
            {t(lang, 'jednokratnaNext')}
          </button>
        )}
        {step === 5 && !isSummary && (
          <button
            type="button"
            onClick={() => {
              if (validateCurrent()) setShowSummary5(true);
            }}
            disabled={!canGoNext()}
            style={{
              ...buttonBase,
              backgroundColor: canGoNext() ? primaryColor : '#ccc',
              color: 'white',
              opacity: canGoNext() ? 1 : 0.7,
            }}
          >
            {t(lang, 'wizardPreview')}
          </button>
        )}
        {step === 5 && isSummary && (
          <>
            <button
              type="button"
              onClick={handleBack}
              disabled={isSubmitting}
              style={{
                ...buttonBase,
                backgroundColor: 'transparent',
                color: '#666',
                border: '1px solid #ccc',
                opacity: isSubmitting ? 0.6 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {t(lang, 'jednokratnaBack')}
            </button>
            {onOdustani && (
              <button
                type="button"
                onClick={handleOdustaniClick}
                disabled={isSubmitting}
                style={{
                  ...buttonBase,
                  backgroundColor: 'transparent',
                  color: '#c62828',
                  border: '1px solid #c62828',
                  opacity: isSubmitting ? 0.6 : 1,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {t(lang, 'jednokratnaOdustani')}
              </button>
            )}
            <button
              type="button"
              disabled={!canSubmit || isSubmitting}
              aria-busy={isSubmitting}
              onClick={handleSendRequest}
              style={{
                ...buttonBase,
                backgroundColor: canSubmit ? primaryColor : '#ccc',
                color: 'white',
                opacity: isSubmitting ? 0.8 : 1,
                cursor: canSubmit && !isSubmitting ? 'pointer' : 'not-allowed',
              }}
            >
              {isSubmitting ? t(lang, 'jednokratnaSubmitting') : t(lang, 'jednokratnaSendRequest')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default JednokratnaNovcanaPomocWizard;
