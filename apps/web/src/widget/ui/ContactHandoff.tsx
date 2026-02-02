import React, { useState } from 'react';
import { t } from '../i18n';

export interface ContactData {
  name?: string;
  phone?: string;
  email?: string;
  note?: string;
  location?: string;
  consent: boolean;
}

interface ContactHandoffProps {
  onSubmit: (contactData: ContactData) => void;
  lang?: string;
  primaryColor?: string;
}

const ContactHandoff: React.FC<ContactHandoffProps> = ({
  onSubmit,
  lang,
  primaryColor = '#0b3a6e',
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [location, setLocation] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; email?: string; consent?: string }>({});

  const validate = (): boolean => {
    const newErrors: { phone?: string; email?: string; consent?: string } = {};
    
    if (!phone.trim() && !email.trim()) {
      newErrors.phone = t(lang, 'contactErrorPhoneOrEmail');
      newErrors.email = t(lang, 'contactErrorPhoneOrEmail');
    }
    
    if (phone.trim() && !/^[\d\s\-\+\(\)]+$/.test(phone.trim())) {
      newErrors.phone = t(lang, 'contactErrorPhoneFormat');
    }
    
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = t(lang, 'contactErrorEmailFormat');
    }
    
    if (!consent) {
      newErrors.consent = t(lang, 'contactErrorConsent');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validate()) {
      onSubmit({
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        note: note.trim() || undefined,
        location: location.trim() || undefined,
        consent: true,
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
        {t(lang, 'contactTitle')}
      </h4>
      <p
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: '#666',
        }}
      >
        {t(lang, 'contactDescription')}
      </p>
      
      <form onSubmit={handleSubmit}>
        {/* Name */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
            }}
          >
            {t(lang, 'contactName')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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

        {/* Phone */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
            }}
          >
            {t(lang, 'contactPhone')} <span style={{ color: '#999' }}>({t(lang, 'contactOptional')})</span>
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
            }}
          >
            {t(lang, 'contactEmail')} <span style={{ color: '#999' }}>({t(lang, 'contactOptional')})</span>
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
        </div>

        {/* Note */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
            }}
          >
            {t(lang, 'contactNote')}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
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
              e.target.style.borderColor = '#ddd';
            }}
          />
        </div>

        {/* Location */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: '#333',
            }}
          >
            Lokacija / adresa (opcionalno)
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Npr. Ulica i broj, opis lokacije..."
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
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
            Napomena: Podaci o lokaciji mogu sadržavati osobne podatke. Koristit će se samo za rješavanje upita.
          </div>
        </div>

        {/* Consent */}
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
            <span>{t(lang, 'contactConsent')}</span>
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
          {t(lang, 'contactSubmit')}
        </button>
      </form>
    </div>
  );
};

export default ContactHandoff;
