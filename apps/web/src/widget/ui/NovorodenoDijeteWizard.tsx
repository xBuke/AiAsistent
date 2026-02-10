import React, { useState, useCallback } from 'react';
import { t } from '../i18n';

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
  };
}

// Validation
const OIB_REGEX = /^\d{11}$/;
const IBAN_MIN_LENGTH = 15;
const DATUM_REGEX = /^\d{2}\.\d{2}\.\d{4}\.?$/;
const GODINA_REGEX = /^\d{4}$/;

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
  const { datum_rodjenja, godina_rodjenja } = data.dijete;
  return (
    DATUM_REGEX.test((datum_rodjenja || '').trim()) &&
    GODINA_REGEX.test((godina_rodjenja || '').trim())
  );
}

function validateStep4(data: NovorodenoDijeteFormData): boolean {
  const { roditelj_izvan_ploca, za_trece_ili_sljedece } = data.posebne_okolnosti;
  return roditelj_izvan_ploca !== null && za_trece_ili_sljedece !== null;
}

interface NovorodenoDijeteWizardProps {
  lang?: string;
  primaryColor?: string;
  step: number;
  data: NovorodenoDijeteFormData;
  onStepChange: (step: number) => void;
  onDataChange: (data: NovorodenoDijeteFormData) => void;
  onSendRequest: () => void;
}

const NovorodenoDijeteWizard: React.FC<NovorodenoDijeteWizardProps> = ({
  lang,
  primaryColor = '#0b3a6e',
  step,
  data,
  onStepChange,
  onDataChange,
  onSendRequest,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSummary4, setShowSummary4] = useState(false);

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
    if (step === 4) return validateStep4(data);
    return false;
  };

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
      const gr = (data.dijete.godina_rodjenja || '').trim();
      if (!DATUM_REGEX.test(dr)) e.datum_rodjenja = t(lang, 'novorodenoErrorDatum');
      if (!GODINA_REGEX.test(gr)) e.godina_rodjenja = t(lang, 'novorodenoErrorGodina');
    }
    if (step === 4) {
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
    if (step < 4) {
      onStepChange(step + 1);
      if (step + 1 === 4) setShowSummary4(false);
    } else if (step === 4) {
      setShowSummary4(true);
    }
  };

  const handleBack = () => {
    if (step === 4 && showSummary4) {
      setShowSummary4(false);
      setErrors({});
      return;
    }
    if (step > 1) {
      onStepChange(step - 1);
      if (step - 1 === 4) setShowSummary4(false);
    }
    setErrors({});
  };

  // No submit logic yet – button is disabled/inert
  const handleSendRequest = () => {
    if (step !== 4 || !validateStep4(data)) return;
    onSendRequest();
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

  const isSummary = step === 4 && showSummary4;

  return (
    <div style={baseStyle}>
      <div style={progressStyle}>
        {t(lang, 'novorodenoStep')} {step} / 4
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
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'novorodenoDatumRodjenja')} *</label>
            <input
              type="text"
              value={data.dijete.datum_rodjenja}
              onChange={(e) =>
                update({
                  dijete: { ...data.dijete, datum_rodjenja: e.target.value },
                })
              }
              placeholder="DD.MM.YYYY."
              style={inputStyle(!!errors.datum_rodjenja)}
            />
            {errors.datum_rodjenja && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.datum_rodjenja}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>{t(lang, 'novorodenoGodinaRodjenja')} *</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={data.dijete.godina_rodjenja}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                update({
                  dijete: { ...data.dijete, godina_rodjenja: v },
                });
              }}
              placeholder="YYYY"
              style={inputStyle(!!errors.godina_rodjenja)}
            />
            {errors.godina_rodjenja && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
                {errors.godina_rodjenja}
              </div>
            )}
          </div>
        </>
      )}

      {step === 4 && !isSummary && (
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

      {step === 4 && isSummary && (
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

      <div style={buttonRowStyle}>
        {step > 1 && (
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
        {step < 4 && (
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
        {step === 4 && !isSummary && (
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
        {step === 4 && isSummary && (
          <>
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
            <button
              type="button"
              disabled
              aria-disabled="true"
              onClick={() => {}}
              style={{
                ...buttonBase,
                backgroundColor: primaryColor,
                color: 'white',
                opacity: 0.6,
                cursor: 'not-allowed',
              }}
            >
              {t(lang, 'novorodenoSendRequest')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default NovorodenoDijeteWizard;
