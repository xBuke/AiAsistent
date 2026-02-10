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

/** Known title of the novorodeno_dijete doc in the knowledge base (used when backend does not send type) */
const NOVORODENO_DOC_TITLE = 'Novčana pomoć za novorođeno dijete';

function normalizeTitle(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * True if the message is from assistant and has sources where at least one has type === "novorodeno_dijete"
 * or title matches the known doc (human title or filename form, e.g. novcana_pomoc_za_novorodeno_dijete).
 */
function assistantMessageHasNovorodenoSource(message: Message): boolean {
  if (message.role !== 'assistant') return false;
  const docs = message.metadata?.retrieved_docs_top3;
  if (!Array.isArray(docs) || docs.length === 0) return false;
  const wantTitleNorm = normalizeTitle(NOVORODENO_DOC_TITLE); // "novcana pomoc za novorodeno dijete"
  return docs.some((doc: { type?: string; title?: string | null }) => {
    if (doc.type === 'novorodeno_dijete') return true;
    if (!wantTitleNorm) return false;
    const docNorm = normalizeTitle(doc.title ?? '');
    if (docNorm === wantTitleNorm) return true;
    // Backend stores title from filename (e.g. novcana_pomoc_za_novorodeno_dijete); match when normalized with spaces equals wantTitleNorm
    if (docNorm.replace(/_/g, ' ') === wantTitleNorm) return true;
    return false;
  });
}

interface MessageListProps {
  messages: Message[];
  showTypingIndicator: boolean;
  lang?: string;
  ctaDismissed?: boolean;
  activeForm?: string | null;
  onCtaDismiss?: () => void;
  onCtaSubmit?: () => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  showTypingIndicator,
  lang,
  ctaDismissed = false,
  activeForm = null,
  onCtaDismiss,
  onCtaSubmit,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [openCitationsId, setOpenCitationsId] = useState<string | null>(null);

  const lastMatchingAssistantId =
    messages
      .filter((m) => assistantMessageHasNovorodenoSource(m))
      .map((m) => m.id)
      .pop() ?? null;
  const showCta =
    !!lastMatchingAssistantId && !ctaDismissed && !activeForm && (onCtaDismiss != null || onCtaSubmit != null);

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
            {message.role === 'assistant' && message.id === lastMatchingAssistantId && showCta && (
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
                  onClick={onCtaSubmit}
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
                  onClick={onCtaDismiss}
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
