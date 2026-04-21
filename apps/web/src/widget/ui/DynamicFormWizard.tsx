import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';

export interface FormFieldPublic {
  id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
  options?: string[];
}

export interface FormAttachmentPublic {
  id: string;
  label: string;
  description: string;
  required: boolean;
}

export interface FormDefinitionPublic {
  id: string;
  name: string;
  slug: string;
  description: string;
  fields: FormFieldPublic[];
  requiredAttachments: FormAttachmentPublic[];
  triggerDocSlugs: string[];
}

const MAX_ATTACHMENTS_TOTAL = 10;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const FIELDS_PER_STEP = 3;

function chunkFields<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function normalizeFieldValue(field: FormFieldPublic, raw: string | boolean): string {
  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }
  if (field.type === 'checkbox') {
    return raw === 'true' ? 'true' : 'false';
  }
  return String(raw ?? '').trim();
}

function isFieldEmpty(field: FormFieldPublic, value: unknown): boolean {
  if (!field.required) return false;
  if (field.type === 'checkbox') {
    return value !== true && value !== 'true';
  }
  if (field.type === 'radio') {
    return value == null || (typeof value === 'string' && value.trim() === '');
  }
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

interface DynamicFormWizardProps {
  definition: FormDefinitionPublic;
  citySlug: string;
  apiBase: string;
  onClose: () => void;
  onSuccess: (pdfUrl: string) => void;
  lang?: string;
  primaryColor?: string;
}

const DynamicFormWizard: React.FC<DynamicFormWizardProps> = ({
  definition,
  citySlug,
  apiBase,
  onClose,
  onSuccess,
  lang,
  primaryColor = '#0b3a6e',
}) => {
  const fieldSteps = useMemo(
    () => chunkFields(definition.fields, FIELDS_PER_STEP),
    [definition.fields]
  );
  const totalSteps = Math.max(1, fieldSteps.length + 1);
  const attachmentsStepIndex = fieldSteps.length;

  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    for (const f of definition.fields) {
      if (f.type === 'checkbox') init[f.id] = false;
      else init[f.id] = '';
    }
    return init;
  });
  const [attachmentFiles, setAttachmentFiles] = useState<Record<string, File | null>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

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

  const setField = useCallback((id: string, v: string | boolean) => {
    setValues((prev) => ({ ...prev, [id]: v }));
    setErrors((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
  }, []);

  const validateCurrentStep = (): boolean => {
    const e: Record<string, string> = {};
    if (stepIndex < attachmentsStepIndex) {
      const fields = fieldSteps[stepIndex] ?? [];
      for (const f of fields) {
        if (f.required && isFieldEmpty(f, values[f.id])) {
          e[f.id] = t(lang, 'novorodenoErrorRequired');
        }
      }
    } else {
      for (const att of definition.requiredAttachments) {
        if (att.required !== true) continue;
        const file = attachmentFiles[att.id];
        if (!file) {
          e[`att_${att.id}`] = t(lang, 'attachmentsInvalidCategory');
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const canProceedFields = (): boolean => {
    if (stepIndex >= attachmentsStepIndex) return true;
    const fields = fieldSteps[stepIndex] ?? [];
    return fields.every((f) => !f.required || !isFieldEmpty(f, values[f.id]));
  };

  const canSubmitAttachments = (): boolean => {
    for (const att of definition.requiredAttachments) {
      if (att.required !== true) continue;
      if (!attachmentFiles[att.id]) return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    if (stepIndex < totalSteps - 1) {
      setStepIndex((s) => s + 1);
      setSubmitError(null);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((s) => s - 1);
      setSubmitError(null);
      setErrors({});
    }
  };

  const uploadAttachment = useCallback(
    async (categoryKey: string, categoryLabel: string, file: File, ref: string) => {
      const base = apiBase.replace(/\/$/, '');
      const url = `${base}/forms/${encodeURIComponent(ref)}/attachments`;
      const form = new FormData();
      form.append('category_key', categoryKey);
      form.append('category_label', categoryLabel);
      form.append('file', file);
      const res = await fetch(url, { method: 'POST', body: form });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        throw new Error(json.error || t(lang, 'attachmentsUploadError'));
      }
    },
    [apiBase, lang]
  );

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;
    if (!apiBase?.trim() || !citySlug?.trim()) {
      setSubmitError(t(lang, 'novorodenoSubmitError'));
      return;
    }
    setSubmitError(null);
    setDraftError(null);
    setIsSubmitting(true);

    const base = apiBase.replace(/\/$/, '');
    let ref = referenceNumber;

    try {
      if (!ref) {
        // POST /forms/draft expects snake_case: city_slug, form_definition_id, data_json (see API).
        const city_slug = String(citySlug ?? '').trim();
        const form_definition_id = String(definition.id ?? '').trim();
        if (!city_slug || !form_definition_id) {
          setDraftError(t(lang, 'attachmentsDraftError'));
          setIsSubmitting(false);
          return;
        }
        const draftRes = await fetch(`${base}/forms/draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            city_slug,
            form_definition_id,
            data_json: {},
          }),
        });
        const draftJson = (await draftRes.json().catch(() => ({}))) as {
          reference_number?: string;
          error?: string;
        };
        if (!draftRes.ok || !draftJson.reference_number) {
          setDraftError(draftJson.error || t(lang, 'attachmentsDraftError'));
          setIsSubmitting(false);
          return;
        }
        ref = draftJson.reference_number;
        setReferenceNumber(ref);
      }

      const dataPayload: Record<string, string> = {};
      for (const f of definition.fields) {
        dataPayload[f.id] = normalizeFieldValue(f, values[f.id] ?? '');
      }

      const enabledCategories: string[] = [];
      let uploadCount = 0;
      for (const att of definition.requiredAttachments) {
        const file = attachmentFiles[att.id];
        if (!file) {
          if (att.required === true) {
            setIsSubmitting(false);
            return;
          }
          continue;
        }
        enabledCategories.push(att.id);
        uploadCount++;
        if (uploadCount > MAX_ATTACHMENTS_TOTAL) {
          setSubmitError(t(lang, 'attachmentsLimitReached'));
          setIsSubmitting(false);
          return;
        }
        setUploadingKey(att.id);
        try {
          if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
            throw new Error(t(lang, 'attachmentsInvalidFileTypeOrSize'));
          }
          if (file.size > MAX_FILE_SIZE_BYTES) {
            throw new Error(t(lang, 'attachmentsInvalidFileTypeOrSize'));
          }
          await uploadAttachment(att.id, att.label, file, ref);
        } catch (err) {
          const msg = err instanceof Error ? err.message : t(lang, 'attachmentsUploadError');
          setAttachmentErrors((prev) => ({ ...prev, [att.id]: msg }));
          setSubmitError(msg);
          setIsSubmitting(false);
          setUploadingKey(null);
          return;
        }
        setUploadingKey(null);
      }

      for (const att of definition.requiredAttachments) {
        if (att.required === true && !enabledCategories.includes(att.id)) {
          setIsSubmitting(false);
          return;
        }
      }

      const submitRes = await fetch(`${base}/forms/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city_slug: String(citySlug ?? '').trim(),
          form_definition_id: String(definition.id ?? '').trim(),
          reference_number: ref,
          data: dataPayload,
          attachments_enabled_categories: enabledCategories,
        }),
      });
      const submitJson = (await submitRes.json().catch(() => ({}))) as {
        reference_number?: string;
        error?: string;
      };
      if (!submitRes.ok || !submitJson.reference_number) {
        setSubmitError(submitJson.error || t(lang, 'novorodenoSubmitError'));
        setIsSubmitting(false);
        return;
      }

      const pdfUrl = `${base}/forms/${encodeURIComponent(submitJson.reference_number)}/pdf`;
      onSuccess(pdfUrl);
    } catch {
      setSubmitError(t(lang, 'novorodenoSubmitError'));
    } finally {
      setIsSubmitting(false);
      setUploadingKey(null);
    }
  };

  const renderField = (f: FormFieldPublic) => {
    const err = errors[f.id];
    const v = values[f.id];

    if (f.type === 'textarea') {
      return (
        <div key={f.id} style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>
            {f.label}
            {f.required ? ' *' : ''}
          </label>
          <textarea
            value={typeof v === 'string' ? v : ''}
            onChange={(e) => setField(f.id, e.target.value)}
            placeholder={f.placeholder || ''}
            rows={4}
            style={{
              ...inputStyle(!!err),
              resize: 'vertical',
              minHeight: '80px',
            }}
          />
          {err && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>{err}</div>
          )}
        </div>
      );
    }

    if (f.type === 'select' && f.options && f.options.length > 0) {
      return (
        <div key={f.id} style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>
            {f.label}
            {f.required ? ' *' : ''}
          </label>
          <select
            value={typeof v === 'string' ? v : ''}
            onChange={(e) => setField(f.id, e.target.value)}
            style={inputStyle(!!err)}
          >
            <option value="">—</option>
            {f.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {err && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>{err}</div>
          )}
        </div>
      );
    }

    if (f.type === 'checkbox') {
      const checked = v === true || v === 'true';
      return (
        <div key={f.id} style={{ marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setField(f.id, e.target.checked)}
            />
            <span style={{ fontSize: '14px', color: '#333', fontWeight: 500 }}>
              {f.label}
              {f.required ? ' *' : ''}
            </span>
          </label>
          {err && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>{err}</div>
          )}
        </div>
      );
    }

    if (f.type === 'radio' && f.options && f.options.length > 0) {
      return (
        <div key={f.id} style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>
            {f.label}
            {f.required ? ' *' : ''}
          </label>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {f.options.map((opt) => (
              <label
                key={opt}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name={`dyn_${f.id}`}
                  checked={(typeof v === 'string' ? v : '') === opt}
                  onChange={() => setField(f.id, opt)}
                />
                {opt}
              </label>
            ))}
          </div>
          {err && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>{err}</div>
          )}
        </div>
      );
    }

    const inputType =
      f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : 'text';

    return (
      <div key={f.id} style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>
          {f.label}
          {f.required ? ' *' : ''}
        </label>
        <input
          type={inputType}
          value={typeof v === 'string' ? v : ''}
          onChange={(e) => setField(f.id, e.target.value)}
          placeholder={f.placeholder || ''}
          style={inputStyle(!!err)}
        />
        {err && (
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>{err}</div>
        )}
      </div>
    );
  };

  const isAttachmentsStep = stepIndex === attachmentsStepIndex;
  const displayStep = stepIndex + 1;

  useEffect(() => {
    if (!isAttachmentsStep) return;
    for (const att of definition.requiredAttachments) {
      console.log(
        '[DynamicFormWizard] attachment required debug',
        att.id,
        att.required,
        typeof att.required
      );
    }
  }, [isAttachmentsStep, definition.requiredAttachments]);

  return (
    <div style={baseStyle}>
      <div style={progressStyle}>
        {t(lang, 'novorodenoStep')} {displayStep} / {totalSteps}
      </div>

      {definition.description ? (
        <div style={{ marginBottom: '12px', fontSize: '13px', color: '#555' }}>
          {definition.description}
        </div>
      ) : null}

      {!isAttachmentsStep && (
        <>{(fieldSteps[stepIndex] ?? []).map((f) => renderField(f))}</>
      )}

      {isAttachmentsStep && (
        <>
          <div style={{ marginBottom: '8px', fontWeight: 600 }}>{t(lang, 'attachmentsStepTitle')}</div>
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>
            {t(lang, 'attachmentsMaxSize')}
          </div>
          {draftError && (
            <div
              style={{
                marginBottom: '8px',
                padding: '8px 12px',
                backgroundColor: '#ffebee',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#c62828',
              }}
            >
              {draftError}
            </div>
          )}
          {submitError && (
            <div
              style={{
                marginBottom: '8px',
                padding: '8px 12px',
                backgroundColor: '#ffebee',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#c62828',
              }}
            >
              {submitError}
            </div>
          )}
          {definition.requiredAttachments.map((att) => {
            const err = errors[`att_${att.id}`] || attachmentErrors[att.id];
            const isUp = uploadingKey === att.id;
            return (
              <div
                key={att.id}
                style={{
                  marginBottom: '14px',
                  padding: '10px 12px',
                  backgroundColor: '#fff',
                  borderRadius: '8px',
                  border: '1px solid #e0e6ed',
                }}
              >
                <div style={{ marginBottom: '4px', fontWeight: 500 }}>{att.label}</div>
                {att.description ? (
                  <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>
                    {att.description}
                  </div>
                ) : null}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  style={{ marginTop: '6px', fontSize: '13px' }}
                  disabled={isSubmitting || isUp}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setAttachmentFiles((prev) => ({ ...prev, [att.id]: file }));
                    setAttachmentErrors((prev) => {
                      const n = { ...prev };
                      delete n[att.id];
                      return n;
                    });
                    setErrors((prev) => {
                      const n = { ...prev };
                      delete n[`att_${att.id}`];
                      return n;
                    });
                    e.target.value = '';
                  }}
                />
                {attachmentFiles[att.id] && (
                  <div style={{ marginTop: '6px', fontSize: '13px', color: '#333' }}>
                    {attachmentFiles[att.id]?.name}
                  </div>
                )}
                {err && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#c62828' }}>{err}</div>
                )}
                {isUp && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>Prijenos...</div>
                )}
              </div>
            );
          })}
        </>
      )}

      <div style={buttonRowStyle}>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          style={{
            ...buttonBase,
            backgroundColor: 'transparent',
            color: '#666',
            border: '1px solid #ccc',
          }}
        >
          {t(lang, 'novorodenoOdustani')}
        </button>
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={handleBack}
            disabled={isSubmitting}
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
        {!isAttachmentsStep && (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceedFields()}
            style={{
              ...buttonBase,
              backgroundColor: canProceedFields() ? primaryColor : '#ccc',
              color: 'white',
              opacity: canProceedFields() ? 1 : 0.7,
            }}
          >
            {t(lang, 'novorodenoNext')}
          </button>
        )}
        {isAttachmentsStep && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmitAttachments()}
            style={{
              ...buttonBase,
              backgroundColor:
                !isSubmitting && canSubmitAttachments() ? primaryColor : '#ccc',
              color: 'white',
              cursor: isSubmitting ? 'wait' : 'pointer',
            }}
          >
            {isSubmitting ? t(lang, 'novorodenoSubmitting') : t(lang, 'novorodenoSendRequest')}
          </button>
        )}
      </div>
    </div>
  );
};

export default DynamicFormWizard;
