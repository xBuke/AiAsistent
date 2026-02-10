import React, { useEffect, useRef, useState } from 'react';
import TypingIndicator from './TypingIndicator';
import { linkifyText } from '../utils/linkify';
import { t } from '../i18n';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

/** Slug title for novorodeno doc as sent in retrieved_docs_top3 (no doc.type from API) */
const NOVORODENO_SLUG = 'novcana_pomoc_za_novorodeno_dijete';
/** Slug for jednokratna novčana pomoć doc (match normalizeTitle(doc.title)) */
const JEDNOKRATNA_SLUG = 'jednokratna_novcana_pomoc';

export type FormCtaType = 'novorodeno_dijete' | 'jednokratna_novcana_pomoc';

function normalizeTitle(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * True if message is assistant and has at least one retrieved doc matching the novorodeno slug.
 * API does not send doc.type; match on doc.title (slug) only.
 */
function assistantMessageHasNovorodenoSource(message: Message): boolean {
  if (message.role !== 'assistant') return false;
  const docs = message.metadata?.retrieved_docs_top3;
  if (!Array.isArray(docs) || docs.length === 0) return false;
  return docs.some((doc: { title?: string | null }) => {
    const docNorm = normalizeTitle(doc.title ?? '');
    return docNorm === NOVORODENO_SLUG || docNorm.includes('novorodeno');
  });
}

/**
 * True if message is assistant and has at least one retrieved doc matching the jednokratna slug.
 * Match on normalizeTitle(doc.title) only (no doc.type).
 */
function assistantMessageHasJednokratnaSource(message: Message): boolean {
  if (message.role !== 'assistant') return false;
  const docs = message.metadata?.retrieved_docs_top3;
  if (!Array.isArray(docs) || docs.length === 0) return false;
  return docs.some((doc: { title?: string | null }) => {
    const docNorm = normalizeTitle(doc.title ?? '');
    return docNorm === JEDNOKRATNA_SLUG;
  });
}

interface MessageListProps {
  messages: Message[];
  showTypingIndicator: boolean;
  lang?: string;
  ctaDismissed?: boolean;
  ctaDismissedJednokratna?: boolean;
  activeForm?: string | null;
  onCtaDismiss?: (formType: FormCtaType) => void;
  onCtaSubmit?: (formType: FormCtaType) => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  showTypingIndicator,
  lang,
  ctaDismissed = false,
  ctaDismissedJednokratna = false,
  activeForm = null,
  onCtaDismiss,
  onCtaSubmit,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [openCitationsId, setOpenCitationsId] = useState<string | null>(null);

  const lastNovorodenoId =
    messages
      .filter((m) => assistantMessageHasNovorodenoSource(m))
      .map((m) => m.id)
      .pop() ?? null;
  const lastJednokratnaId =
    messages
      .filter((m) => assistantMessageHasJednokratnaSource(m))
      .map((m) => m.id)
      .pop() ?? null;

  const idxNovorodeno = lastNovorodenoId ? messages.findIndex((m) => m.id === lastNovorodenoId) : -1;
  const idxJednokratna = lastJednokratnaId ? messages.findIndex((m) => m.id === lastJednokratnaId) : -1;
  const lastMatchingAssistantId =
    idxJednokratna > idxNovorodeno ? lastJednokratnaId : lastNovorodenoId;
  const ctaFormType: FormCtaType | null =
    lastMatchingAssistantId != null
      ? idxJednokratna > idxNovorodeno
        ? 'jednokratna_novcana_pomoc'
        : 'novorodeno_dijete'
      : null;

  const dismissedForCurrentForm =
    ctaFormType === 'novorodeno_dijete'
      ? ctaDismissed
      : ctaFormType === 'jednokratna_novcana_pomoc'
        ? ctaDismissedJednokratna
        : true;
  const showCta =
    !!lastMatchingAssistantId &&
    !dismissedForCurrentForm &&
    !activeForm &&
    (onCtaDismiss != null || onCtaSubmit != null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, showTypingIndicator]);

  const toggleCitations = (messageId: string) => {
    setOpenCitationsId(prev => prev === messageId ? null : messageId);
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {messages.map((message) => {
        // Get citations from message metadata for assistant messages (same path as CTA)
        const docs = message.role === 'assistant' ? message.metadata?.retrieved_docs_top3 : null;
        const hasCitations = Array.isArray(docs) && docs.length > 0;
        const isCitationsOpen = openCitationsId === message.id;

        return (
          <div
            key={message.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: '16px',
                  backgroundColor: message.role === 'user' ? '#0b3a6e' : '#f0f0f0',
                  color: message.role === 'user' ? 'white' : '#333',
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {linkifyText(message.content).map((token, index) => {
                  if (token.type === 'text') {
                    return <span key={index}>{token.value}</span>;
                  }
                  // token.type === 'link'
                  const linkColor = message.role === 'user' ? '#a8d5ff' : '#0b3a6e';
                  return (
                    <a
                      key={index}
                      href={token.href}
                      target={token.kind === 'url' ? '_blank' : undefined}
                      rel={token.kind === 'url' ? 'noreferrer' : undefined}
                      style={{
                        color: linkColor,
                      }}
                    >
                      {token.value}
                    </a>
                  );
                })}
              </div>
            </div>
            {hasCitations && (
              <>
                <button
                  onClick={() => toggleCitations(message.id)}
                  style={{
                    marginTop: '6px',
                    padding: '4px 8px',
                    border: 'none',
                    background: 'transparent',
                    color: '#0b3a6e',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textDecoration: 'underline',
                    alignSelf: 'flex-start',
                  }}
                >
                  Izvori ({docs.length})
                </button>
                {isCitationsOpen && (
                  <div
                    style={{
                      marginTop: '8px',
                      maxWidth: '75%',
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: '#f9f9f9',
                      border: '1px solid #e0e0e0',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    {docs.map((doc: any, index: number) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: '600',
                            color: '#333',
                          }}
                        >
                          {doc.title || 'Bez naslova'}
                        </div>
                        <div
                          style={{
                            color: '#666',
                            wordWrap: 'break-word',
                          }}
                        >
                          {doc.source || 'Izvor nepoznat'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {message.role === 'assistant' && message.id === lastMatchingAssistantId && showCta && ctaFormType != null && (
              <div
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => onCtaSubmit?.(ctaFormType)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: '#0b3a6e',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {t(lang, 'ctaSubmitRequest')}
                </button>
                <button
                  type="button"
                  onClick={() => onCtaDismiss?.(ctaFormType)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '20px',
                    border: '1px solid #ccc',
                    backgroundColor: 'transparent',
                    color: '#666',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  {t(lang, 'ctaNotNow')}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {showTypingIndicator && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <div
            style={{
              backgroundColor: '#f0f0f0',
              borderRadius: '16px',
            }}
          >
            <TypingIndicator />
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
