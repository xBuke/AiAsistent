import React, { useState, useCallback, useEffect } from 'react';
import { t } from '../i18n';

/** Single uploaded attachment (from API response) */
export interface NovorodenoAttachmentItem {
  id: string;
  stored_filename: string;
  category_key: string;
  category_label?: string;
  size_bytes?: number;
  mime_type?: string;
  created_at?: string;
}

export interface NovorodenoDijeteFormData {
  podnositelj: {
    ime_prezime: string;
    adresa: string;
    kontakt: string;
  };
  identifikacija: {
    oib: string;
    iban: string;
  };
  dijete: {
    datum_rodjenja: string;
    godina_rodjenja: string;
    mjesto_rodjenja: string;
  };
  posebne_okolnosti: {
    roditelj_izvan_ploca: boolean | null;
    za_trece_ili_sljedece: boolean | null;
  };
  meta: {
    mjesto_podnosenja: string;
    datum_podnosenja: string;
  };
  draftReferenceNumber?: string;
  draftFormRequestId?: string;
  attachments?: {
    enabledCategories: Record<string, boolean>;
    uploaded: NovorodenoAttachmentItem[];
    errors?: Record<string, string>;
  };
}

const DEFAULT_MJESTO = 'Ploče';

function todayCroatian(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}.`;
}

export function getDefaultNovorodenoData(): NovorodenoDijeteFormData {
  return {
    podnositelj: { ime_prezime: '', adresa: '', kontakt: '' },
    identifikacija: { oib: '', iban: '' },
    dijete: {
      datum_rodjenja: '',
      godina_rodjenja: '',
      mjesto_rodjenja: DEFAULT_MJESTO,
    },
    posebne_okolnosti: { roditelj_izvan_ploca: null, za_trece_ili_sljedece: null },
    meta: { mjesto_podnosenja: DEFAULT_MJESTO, datum_podnosenja: todayCroatian() },
    attachments: { enabledCategories: {}, uploaded: [] },
  };
}

const MAX_ATTACHMENTS_TOTAL = 10;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const NOVORODENO_ATTACHMENT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'rodni_list_djeteta', label: 'Rodni list djeteta' },
  { key: 'prebivaliste', label: 'Uvjerenje o prebivalištu' },
  { key: 'osobne_roditelja', label: 'Preslike osobnih iskaznica roditelja' },
  { key: 'iban_potvrda', label: 'Potvrda o IBAN-u (tekući račun)' },
  { key: 'izjava_neostvareno', label: 'Izjava da pravo nije ostvareno drugdje' },
  { key: 'rodni_listovi_ostale_djece', label: 'Rodni listovi ostale djece (ako postoji)' },
  { key: 'ostalo', label: 'Ostalo' },
];

// Validation
const OIB_REGEX = /^\d{11}$/;
const IBAN_MIN_LENGTH = 15;
const DATUM_REGEX = /^\d{2}\.\d{2}\.\d{4}\.?$/;

/** Auto-format digits into DD.MM.YYYY. (e.g. 12011996 -> 12.01.1996.) */
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits.length === 2 ? `${digits}.` : digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}.`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}.`;
}

/** Extract year from DD.MM.YYYY. or DD.MM.YYYY */
function extractYear(datum: string): string {
  const digits = (datum || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(4, 8) : '';
}

/** Validate date: 8 digits, day 01-31, month 01-12, year 1900-2100 */
function isValidDate(datum: string): boolean {
  const digits = (datum || '').replace(/\D/g, '');
  if (digits.length !== 8) return false;
  const day = parseInt(digits.slice(0, 2), 10);
  const month = parseInt(digits.slice(2, 4), 10);
  const year = parseInt(digits.slice(4, 8), 10);
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100;
}

function validateStep1(data: NovorodenoDijeteFormData): boolean {
  const { ime_prezime, adresa, kontakt } = data.podnositelj;
  return !!ime_prezime?.trim() && !!adresa?.trim() && !!kontakt?.trim();
}

function validateStep2(data: NovorodenoDijeteFormData): boolean {
  const { oib, iban } = data.identifikacija;
  return (
    OIB_REGEX.test((oib || '').trim()) &&
    (iban || '').trim().startsWith('HR') &&
    (iban || '').trim().length >= IBAN_MIN_LENGTH
  );
}

function validateStep3(data: NovorodenoDijeteFormData): boolean {
  const datum = (data.dijete.datum_rodjenja || '').trim();
  return DATUM_REGEX.test(datum) && isValidDate(datum);
}

function validateStep5(data: NovorodenoDijeteFormData): boolean {
  const { roditelj_izvan_ploca, za_trece_ili_sljedece } = data.posebne_okolnosti;
  return roditelj_izvan_ploca !== null && za_trece_ili_sljedece !== null;
}

function validateAttachmentsStep(data: NovorodenoDijeteFormData): boolean {
  if (!data.draftReferenceNumber) return false;
  const uploaded = data.attachments?.uploaded ?? [];
  if (uploaded.length > MAX_ATTACHMENTS_TOTAL) return false;
  const enabled = data.attachments?.enabledCategories ?? {};
  for (const key of Object.keys(enabled)) {
    if (enabled[key] && !uploaded.some((u) => u.category_key === key)) return false;
  }
  return true;
}

interface NovorodenoDijeteWizardProps {
  lang?: string;
  primaryColor?: string;
  step: number;
  data: NovorodenoDijeteFormData;
  onStepChange: (step: number) => void;
  onDataChange: (data: NovorodenoDijeteFormData) => void;
  onSubmit: (data: NovorodenoDijeteFormData) => Promise<{ reference_number?: string; error?: string }>;
  onSuccess: (referenceNumber: string) => void;
  onOdustani?: () => void;
  apiBaseUrl?: string;
  citySlug?: string;
}

const NovorodenoDijeteWizard: React.FC<NovorodenoDijeteWizardProps> = ({
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
    (slice: Partial<NovorodenoDijeteFormData>) => {
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
        body: JSON.stringify({ city_slug: citySlug, type: 'novorodeno_dijete', data_json: {} }),
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
      if (!ALLOWED_MIME.includes(file.type as any)) return;
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
        e.ime_prezime = t(lang, 'novorodenoErrorRequired');
      if (!(data.podnositelj.adresa || '').trim())
        e.adresa = t(lang, 'novorodenoErrorRequired');
      if (!(data.podnositelj.kontakt || '').trim())
        e.kontakt = t(lang, 'novorodenoErrorRequired');
    }
    if (step === 2) {
      const oib = (data.identifikacija.oib || '').trim();
      const iban = (data.identifikacija.iban || '').trim();
      if (!OIB_REGEX.test(oib)) e.oib = t(lang, 'novorodenoErrorOib');
      if (!iban.startsWith('HR') || iban.length < IBAN_MIN_LENGTH)
        e.iban = t(lang, 'novorodenoErrorIban');
    }
    if (step === 3) {
      const dr = (data.dijete.datum_rodjenja || '').trim();
      if (!DATUM_REGEX.test(dr) || !isValidDate(dr)) e.datum_rodjenja = t(lang, 'novorodenoErrorDatum');
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
      if (data.posebne_okolnosti.roditelj_izvan_ploca === null)
        e.roditelj_izvan_ploca = t(lang, 'novorodenoErrorRequired');
      if (data.posebne_okolnosti.za_trece_ili_sljedece === null)
        e.za_trece_ili_sljedece = t(lang, 'novorodenoErrorRequired');
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
    setSubmitError(null);
    setIsSubmitting(true);
    onSubmit(data)
      .then((result) => {
        if (result.reference_number) {
          onSuccess(result.reference_number);
        } else {
          setSubmitError(result.error || t(lang, 'novorodenoSubmitError'));
          setIsSubmitting(false);
        }
      })
      .catch(() => {
        setSubmitError(t(lang, 'novorodenoSubmitError'));
        setIsSubmitting(false);
      });
  };

  const handleSendRequest = () => {
    if (step !== 5 || !validateStep5(data) || isSubmitting) return;
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

  return (
    <div style={baseStyle}>
      <div style={progressStyle}>
        {t(lang, 'novorodenoStep')} {step} / 5
      </div>

      {step === 1 && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'novorodenoImePrezime')} *</label>
            <input
              type="text"
              value={data.podnositelj.ime_prezime}
              onChange={(e) =>
                update({
                  podnositelj: { ...data.podnositelj, ime_prezime: e.target.value },
                })
              }
              placeholder={t(lang, 'novorodenoImePrezimePlaceholder')}
              style={inputStyle(!!errors.ime_prezime)}
            />
            {errors.ime_prezime && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.ime_prezime}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'novorodenoAdresa')} *</label>
            <input
              type="text"
              value={data.podnositelj.adresa}
              onChange={(e) =>
                update({ podnositelj: { ...data.podnositelj, adresa: e.target.value } })
              }
              placeholder={t(lang, 'novorodenoAdresaPlaceholder')}
              style={inputStyle(!!errors.adresa)}
            />
            {errors.adresa && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.adresa}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'novorodenoKontakt')} *</label>
            <input
              type="text"
              value={data.podnositelj.kontakt}
              onChange={(e) =>
                update({ podnositelj: { ...data.podnositelj, kontakt: e.target.value } })
              }
              placeholder={t(lang, 'novorodenoKontaktPlaceholder')}
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
            <label style={labelStyle}>{t(lang, 'novorodenoOib')} *</label>
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
            <label style={labelStyle}>{t(lang, 'novorodenoIban')} *</label>
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
          <label style={labelStyle}>{t(lang, 'novorodenoDatumRodjenja')} *</label>
          <input
            type="text"
            inputMode="numeric"
            value={data.dijete.datum_rodjenja}
            onChange={(e) => {
              const formatted = formatDateInput(e.target.value);
              update({
                dijete: {
                  ...data.dijete,
                  datum_rodjenja: formatted,
                  godina_rodjenja: extractYear(formatted),
                },
              });
            }}
            placeholder="DD.MM.YYYY."
            style={inputStyle(!!errors.datum_rodjenja)}
          />
          {errors.datum_rodjenja && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
              {errors.datum_rodjenja}
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
              {NOVORODENO_ATTACHMENT_CATEGORIES.map(({ key, label }) => {
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
                              if (file.size > MAX_FILE_SIZE_BYTES || !ALLOWED_MIME.includes(file.type as any)) {
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
            <label style={labelStyle}>{t(lang, 'novorodenoRoditeljIzvanPloca')} *</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="roditelj_izvan_ploca"
                  checked={data.posebne_okolnosti.roditelj_izvan_ploca === true}
                  onChange={() =>
                    update({
                      posebne_okolnosti: {
                        ...data.posebne_okolnosti,
                        roditelj_izvan_ploca: true,
                      },
                    })
                  }
                />
                {t(lang, 'novorodenoYes')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="roditelj_izvan_ploca"
                  checked={data.posebne_okolnosti.roditelj_izvan_ploca === false}
                  onChange={() =>
                    update({
                      posebne_okolnosti: {
                        ...data.posebne_okolnosti,
                        roditelj_izvan_ploca: false,
                      },
                    })
                  }
                />
                {t(lang, 'novorodenoNo')}
              </label>
            </div>
            {errors.roditelj_izvan_ploca && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.roditelj_izvan_ploca}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'novorodenoZaTreceIliSljedece')} *</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="za_trece_ili_sljedece"
                  checked={data.posebne_okolnosti.za_trece_ili_sljedece === true}
                  onChange={() =>
                    update({
                      posebne_okolnosti: {
                        ...data.posebne_okolnosti,
                        za_trece_ili_sljedece: true,
                      },
                    })
                  }
                />
                {t(lang, 'novorodenoYes')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="za_trece_ili_sljedece"
                  checked={data.posebne_okolnosti.za_trece_ili_sljedece === false}
                  onChange={() =>
                    update({
                      posebne_okolnosti: {
                        ...data.posebne_okolnosti,
                        za_trece_ili_sljedece: false,
                      },
                    })
                  }
                />
                {t(lang, 'novorodenoNo')}
              </label>
            </div>
            {errors.za_trece_ili_sljedece && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.za_trece_ili_sljedece}
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
            {t(lang, 'novorodenoSummaryTitle')}
          </div>
          <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
            <div><strong>{t(lang, 'novorodenoImePrezime')}:</strong> {data.podnositelj.ime_prezime}</div>
            <div><strong>{t(lang, 'novorodenoAdresa')}:</strong> {data.podnositelj.adresa}</div>
            <div><strong>{t(lang, 'novorodenoKontakt')}:</strong> {data.podnositelj.kontakt}</div>
            <div><strong>{t(lang, 'novorodenoOib')}:</strong> {data.identifikacija.oib}</div>
            <div><strong>{t(lang, 'novorodenoIban')}:</strong> {data.identifikacija.iban}</div>
            <div><strong>{t(lang, 'novorodenoDatumRodjenja')}:</strong> {data.dijete.datum_rodjenja}</div>
            <div><strong>{t(lang, 'novorodenoGodinaRodjenja')}:</strong> {data.dijete.godina_rodjenja}</div>
            <div><strong>{t(lang, 'novorodenoRoditeljIzvanPloca')}:</strong> {data.posebne_okolnosti.roditelj_izvan_ploca ? t(lang, 'novorodenoYes') : t(lang, 'novorodenoNo')}</div>
            <div><strong>{t(lang, 'novorodenoZaTreceIliSljedece')}:</strong> {data.posebne_okolnosti.za_trece_ili_sljedece ? t(lang, 'novorodenoYes') : t(lang, 'novorodenoNo')}</div>
            <div><strong>{t(lang, 'novorodenoMjestoPodnosenja')}:</strong> {data.meta.mjesto_podnosenja}</div>
            <div><strong>{t(lang, 'novorodenoDatumPodnosenja')}:</strong> {data.meta.datum_podnosenja}</div>
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
            <p style={{ margin: '0 0 16px', fontSize: '14px' }}>{t(lang, 'novorodenoOdustaniConfirm')}</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowOdustaniConfirm(false)}
                style={{ ...buttonBase, backgroundColor: '#f0f4f8', color: '#333', border: '1px solid #ccc' }}
              >
                {t(lang, 'novorodenoNastavi')}
              </button>
              <button
                type="button"
                onClick={handleOdustaniConfirm}
                style={{ ...buttonBase, backgroundColor: '#c62828', color: 'white' }}
              >
                {t(lang, 'novorodenoOdustani')}
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
            {t(lang, 'novorodenoBack')}
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
            {t(lang, 'novorodenoNext')}
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
              {t(lang, 'novorodenoBack')}
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
                {t(lang, 'novorodenoOdustani')}
              </button>
            )}
            <button
              type="button"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              onClick={handleSendRequest}
              style={{
                ...buttonBase,
                backgroundColor: primaryColor,
                color: 'white',
                opacity: isSubmitting ? 0.8 : 1,
                cursor: isSubmitting ? 'wait' : 'pointer',
              }}
            >
              {isSubmitting ? t(lang, 'novorodenoSubmitting') : t(lang, 'novorodenoSendRequest')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default NovorodenoDijeteWizard;
