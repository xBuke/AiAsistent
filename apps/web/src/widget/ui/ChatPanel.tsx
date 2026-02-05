import React, { useState, useRef, KeyboardEvent, useEffect } from 'react';
import MessageList, { Message } from './MessageList';
import ContactHandoff, { ContactData } from './ContactHandoff';
import TicketIntakeForm, { TicketIntakeData } from './TicketIntakeForm';
import { t } from '../i18n';
import type { Ticket } from '../../analytics/tickets';

interface ChatPanelProps {
  cityId: string;
  lang?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  messages: Message[];
  showTypingIndicator: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  conversationId: string | null;
  ticket?: Ticket;
  onContactSubmit?: (contactData: ContactData) => void;
  showIntakeForm?: boolean;
  onIntakeSubmit?: (data: TicketIntakeData) => void;
  intakeInitialDescription?: string;
  onOpenIntakeForm?: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  cityId,
  lang,
  logoUrl,
  primaryColor = '#0b3a6e',
  secondaryColor = '#e3b341',
  messages,
  showTypingIndicator,
  onClose,
  onSend,
  conversationId,
  ticket,
  onContactSubmit,
  showIntakeForm = false,
  onIntakeSubmit,
  intakeInitialDescription = '',
  onOpenIntakeForm,
}) => {
  const [inputText, setInputText] = useState('');
  const [handoffDismissed, setHandoffDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSendingRef = useRef<boolean>(false);
  
  // Determine if we should show the handoff form
  const shouldShowHandoff = 
    ticket?.needsHuman === true && 
    !ticket.contact && 
    !handoffDismissed &&
    conversationId !== null &&
    !showIntakeForm; // Don't show handoff if intake form is showing
  

  // Helper to normalize Croatian text for matching (lowercase, trim, strip diacritics)
  const normalizeCroatianText = (text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Strip diacritics
  };

  // Check if message matches ticket intent phrases
  const matchesTicketIntent = (text: string): boolean => {
    const normalized = normalizeCroatianText(text);
    const phrases = [
      'prijaviti problem',
      'prijaviti kvar',
      'prijava problema',
      'prijava kvara',
      'trebam prijaviti',
      'zelim prijaviti',
    ];
    return phrases.some(phrase => normalized.includes(phrase));
  };

  const handleSend = () => {
    // Safety guard: prevent double sends within the same tick
    if (isSendingRef.current) {
      return;
    }
    
    const trimmed = inputText.trim();
    if (!trimmed) {
      return;
    }
    
    // INTAKE GATE: Check if message matches ticket intent before sending
    if (matchesTicketIntent(trimmed)) {
      const textOriginal = trimmed;
      const textNorm = normalizeCroatianText(trimmed);
      console.warn('[INTAKE_GATE] opened form, skipping send', { textOriginal, textNorm });
      
      // Open intake form if callback is provided
      if (onOpenIntakeForm) {
        onOpenIntakeForm();
      }
      
      // Clear input
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      
      // Return early - do NOT call onSend (which would trigger network request)
      return;
    }
    
    isSendingRef.current = true;
    try {
      onSend(trimmed);
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      // Reset guard after a microtask to allow the send to complete
      Promise.resolve().then(() => {
        isSendingRef.current = false;
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const capitalizeCityId = (id: string): string => {
    return id
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '72px',
        right: '0',
        width: '380px',
        height: '600px',
        maxHeight: 'calc(100vh - 100px)',
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: '#fafafa',
        }}
      >
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Logo"
            style={{
              width: '32px',
              height: '32px',
              objectFit: 'contain',
            }}
          />
        )}
        <h3
          style={{
            margin: 0,
            flex: 1,
            fontSize: '18px',
            fontWeight: 600,
            color: '#333',
          }}
        >
          {t(lang, 'titlePrefix')} {capitalizeCityId(cityId)}
        </h3>
        <button
          onClick={onClose}
          style={{
            width: '32px',
            height: '32px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            color: '#666',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f0f0f0';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label={t(lang, 'close')}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18 6L6 18M6 6L18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Body - Message List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <MessageList messages={messages} showTypingIndicator={showTypingIndicator} />
        
        {/* Ticket Intake Form - shown on fallback escalation */}
        {showIntakeForm && onIntakeSubmit ? (
            <TicketIntakeForm
              onSubmit={(data) => {
                onIntakeSubmit(data);
              }}
              lang={lang}
              primaryColor={primaryColor}
              initialDescription={intakeInitialDescription}
            />
          ) : null}
        
        {/* Contact Handoff Form */}
        {shouldShowHandoff && onContactSubmit && (
          <ContactHandoff
            onSubmit={(contactData) => {
              onContactSubmit(contactData);
              setHandoffDismissed(true);
            }}
            lang={lang}
            primaryColor={primaryColor}
          />
        )}
      </div>

      {/* Footer - Input */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#fafafa',
        }}
      >
        {/* Hide input when intake form is showing */}
        {!showIntakeForm && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={t(lang, 'inputPlaceholder')}
            style={{
              flex: 1,
              minHeight: '40px',
              maxHeight: '120px',
              padding: '10px 12px',
              border: `1px solid #ddd`,
              borderRadius: '20px',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              lineHeight: '1.4',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = secondaryColor;
              e.target.style.boxShadow = `0 0 0 2px ${secondaryColor}33`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#ddd';
              e.target.style.boxShadow = 'none';
            }}
            rows={1}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputText.trim()}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: primaryColor,
              color: 'white',
              cursor: inputText.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: inputText.trim() ? 1 : 0.5,
              transition: 'opacity 0.2s',
            }}
            aria-label={t(lang, 'send')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
