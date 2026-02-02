import React, { useState } from 'react';
import { t } from '../i18n';

export interface TicketIntakeData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  description: string;
  consent_given: boolean;
}

interface TicketIntakeFormProps {
  onSubmit: (data: TicketIntakeData) => void;
  lang?: string;
  primaryColor?: string;
  initialDescription?: string;
}

const TicketIntakeForm: React.FC<TicketIntakeFormProps> = ({
  onSubmit,
  lang,
  primaryColor = '#0b3a6e',
  initialDescription = '',
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState(initialDescription);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    description?: string;
    phone?: string;
    email?: string;
    consent?: string;
  }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    
    if (!name.trim()) {
      newErrors.name = t(lang, 'intakeErrorName');
    }
    
    if (!description.trim()) {
      newErrors.description = t(lang, 'intakeErrorDescription');
    }
    
    if (!phone.trim() && !email.trim()) {
      newErrors.phone = t(lang, 'intakeErrorPhoneOrEmail');
      newErrors.email = t(lang, 'intakeErrorPhoneOrEmail');
    }
    
    if (phone.trim() && !/^[\d\s\-\+\(\)]+$/.test(phone.trim())) {
      newErrors.phone = t(lang, 'intakeErrorPhoneFormat');
    }
    
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = t(lang, 'intakeErrorEmailFormat');
    }
    
    if (!consent) {
      newErrors.consent = t(lang, 'intakeErrorConsent');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validate()) {
      onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        description: description.trim(),
        consent_given: true,
      });
    }
  };

  return (
    <div
      style={{
        margin: '16px 0',
        padding: '16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '12px',
        border: `1px solid ${primaryColor}33`,
      }}
    >
      <h4
        style={{
          margin: '0 0 12px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: '#333',
        }}
      >
        {t(lang, 'intakeTitle')}
      </h4>
      <p
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: '#666',
        }}
      >
        {t(lang, 'intakeDescription')}
      </p>
      
      <form onSubmit={handleSubmit}>
        {/* Name - Required */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
              fontWeight: 500,
            }}
          >
            {t(lang, 'intakeName')} <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) {
                setErrors({ ...errors, name: undefined });
              }
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: errors.name ? '1px solid #d32f2f' : '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = primaryColor;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = errors.name ? '#d32f2f' : '#ddd';
            }}
          />
          {errors.name && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
              {errors.name}
            </div>
          )}
        </div>

        {/* Description - Required */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
              fontWeight: 500,
            }}
          >
            {t(lang, 'intakeDescriptionLabel')} <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (errors.description) {
                setErrors({ ...errors, description: undefined });
              }
            }}
            rows={4}
            placeholder={t(lang, 'intakeDescriptionPlaceholder')}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: errors.description ? '1px solid #d32f2f' : '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = primaryColor;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = errors.description ? '#d32f2f' : '#ddd';
            }}
          />
          {errors.description && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
              {errors.description}
            </div>
          )}
        </div>

        {/* Phone */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
              fontWeight: 500,
            }}
          >
            {t(lang, 'intakePhone')} <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (errors.phone) {
                setErrors({ ...errors, phone: undefined });
              }
            }}
            placeholder="+385 XX XXX XXXX"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: errors.phone ? '1px solid #d32f2f' : '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = primaryColor;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = errors.phone ? '#d32f2f' : '#ddd';
            }}
          />
          {errors.phone && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
              {errors.phone}
            </div>
          )}
        </div>

        {/* Email */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
              fontWeight: 500,
            }}
          >
            {t(lang, 'intakeEmail')} <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) {
                setErrors({ ...errors, email: undefined });
              }
            }}
            placeholder="primjer@email.com"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: errors.email ? '1px solid #d32f2f' : '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = primaryColor;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = errors.email ? '#d32f2f' : '#ddd';
            }}
          />
          {errors.email && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
              {errors.email}
            </div>
          )}
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
            {t(lang, 'intakeContactNote')}
          </div>
        </div>

        {/* Address - Optional */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
            }}
          >
            {t(lang, 'intakeAddress')} <span style={{ color: '#999' }}>({t(lang, 'intakeOptional')})</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t(lang, 'intakeAddressPlaceholder')}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = primaryColor;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#ddd';
            }}
          />
        </div>

        {/* GDPR Consent - Required */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              fontSize: '14px',
              color: '#333',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (errors.consent) {
                  setErrors({ ...errors, consent: undefined });
                }
              }}
              style={{
                marginTop: '2px',
                cursor: 'pointer',
              }}
            />
            <span>
              {t(lang, 'intakeConsent')} <span style={{ color: '#d32f2f' }}>*</span>
            </span>
          </label>
          {errors.consent && (
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f', marginLeft: '24px' }}>
              {errors.consent}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '10px 16px',
            backgroundColor: primaryColor,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          {t(lang, 'intakeSubmit')}
        </button>
      </form>
    </div>
  );
};

export default TicketIntakeForm;
