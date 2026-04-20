import React, { useEffect, useRef, useState } from 'react';
import TypingIndicator from './TypingIndicator';
import { linkifyText } from '../utils/linkify';
import { t } from '../i18n';
import type { FormDefinitionPublic } from './DynamicFormWizard';

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
 * CTA form type from this message's TOP-1 doc only (docs[0].title).
 * Deterministic: exact match on normalized title; no fallback.
 */
function getCtaFormTypeFromTopDoc(message: Message): FormCtaType | null {
  if (message.role !== 'assistant') return null;
  const docs = message.metadata?.retrieved_docs_top3 ?? [];
  if (!Array.isArray(docs) || docs.length === 0) return null;
  const topTitle = docs[0]?.title;
  const norm = normalizeTitle(topTitle);
  if (norm === NOVORODENO_SLUG) return 'novorodeno_dijete';
  if (norm === JEDNOKRATNA_SLUG) return 'jednokratna_novcana_pomoc';
  return null;
}

/** Basename without extension from retrieved doc (source preferred, else title). */
function docFilenameBase(doc: { title?: unknown; source?: unknown }): string {
  const source = typeof doc?.source === 'string' ? doc.source.trim() : '';
  const title = typeof doc?.title === 'string' ? doc.title.trim() : '';
  const pick = source || title;
  if (!pick) return '';
  const noPath = pick.replace(/^.*[/\\]/, '');
  return noPath.replace(/\.[^.]+$/i, '');
}

function slugConflictsWithHardcoded(
  defSlug: string,
  hardcodedTopType: FormCtaType | null
): boolean {
  if (!hardcodedTopType) return false;
  if (hardcodedTopType === 'novorodeno_dijete' && defSlug === 'novorodeno_dijete') return true;
  if (hardcodedTopType === 'jednokratna_novcana_pomoc' && defSlug === 'jednokratna_novcana_pomoc')
    return true;
  return false;
}

/**
 * Single best dynamic CTA: first form definition that matches the highest-ranked doc
 * (lowest index in retrieved_docs_top3). If several definitions match that same doc,
 * the first in formDefinitions order wins. At most one CTA per message.
 */
function getBestDynamicFormCtaDefinition(
  message: Message,
  formDefinitions: FormDefinitionPublic[],
  hardcodedTopType: FormCtaType | null
): FormDefinitionPublic | null {
  if (message.role !== 'assistant' || formDefinitions.length === 0) return null;
  const docs = message.metadata?.retrieved_docs_top3 ?? [];
  if (!Array.isArray(docs) || docs.length === 0) return null;

  for (let i = 0; i < docs.length; i++) {
    const base = normalizeTitle(docFilenameBase(docs[i]));
    if (!base) continue;
    for (const def of formDefinitions) {
      if (slugConflictsWithHardcoded(def.slug, hardcodedTopType)) continue;
      const slugs = (def.triggerDocSlugs ?? []).map((s) => normalizeTitle(s)).filter(Boolean);
      if (slugs.length === 0) continue;
      if (slugs.some((s) => s === base)) {
        return def;
      }
    }
  }
  return null;
}

interface MessageListProps {
  messages: Message[];
  showTypingIndicator: boolean;
  lang?: string;
  ctaDismissed?: boolean;
  ctaDismissedJednokratna?: boolean;
  /** True when any form wizard (hardcoded or dynamic) is open — hides CTAs. */
  wizardOpen?: boolean;
  formDefinitions?: FormDefinitionPublic[];
  onOpenDynamicForm?: (definition: FormDefinitionPublic) => void;
  onCtaDismiss?: (formType: FormCtaType) => void;
  onCtaSubmit?: (formType: FormCtaType) => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  showTypingIndicator,
  lang,
  ctaDismissed = false,
  ctaDismissedJednokratna = false,
  wizardOpen = false,
  formDefinitions = [],
  onOpenDynamicForm,
  onCtaDismiss,
  onCtaSubmit,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [openCitationsId, setOpenCitationsId] = useState<string | null>(null);

  // Last assistant message whose top-1 doc (docs[0]) maps to a form type; CTA uses that message's form type
  const messagesWithCta = messages
    .map((m) => ({ id: m.id, formType: getCtaFormTypeFromTopDoc(m) }))
    .filter((x): x is { id: string; formType: FormCtaType } => x.formType != null);
  const lastCta = messagesWithCta.length > 0 ? messagesWithCta[messagesWithCta.length - 1] : null;
  const lastMatchingAssistantId = lastCta?.id ?? null;
  const ctaFormType: FormCtaType | null = lastCta?.formType ?? null;

  const dismissedForCurrentForm =
    ctaFormType === 'novorodeno_dijete'
      ? ctaDismissed
      : ctaFormType === 'jednokratna_novcana_pomoc'
        ? ctaDismissedJednokratna
        : true;
  const showCta =
    !!lastMatchingAssistantId &&
    !dismissedForCurrentForm &&
    !wizardOpen &&
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
        const hardcodedTopType = getCtaFormTypeFromTopDoc(message);
        const dynamicFormCta = getBestDynamicFormCtaDefinition(
          message,
          formDefinitions,
          hardcodedTopType
        );

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
                {message.role === 'assistant' &&
                message.metadata?.formSuccess === true &&
                message.metadata?.referenceNumber ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: 600 }}>{message.content}</div>
                    <div>
                      {t(lang, 'referenceNumberLabel')}:{' '}
                      <strong>{message.metadata.referenceNumber}</strong>
                    </div>
                    {message.metadata.pdfUrl && (
                      <a
                        href={message.metadata.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: '#0b3a6e',
                          fontWeight: 500,
                          textDecoration: 'underline',
                        }}
                      >
                        {t(lang, 'pdfLinkLabel')}
                      </a>
                    )}
                    <div style={{ fontSize: '13px', color: '#666' }}>
                      {t(lang, 'referenceHelperText')}
                    </div>
                  </div>
                ) : (
                  linkifyText(message.content).map((token, index) => {
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
                  })
                )}
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
            {message.role === 'assistant' &&
              !wizardOpen &&
              dynamicFormCta != null &&
              onOpenDynamicForm != null && (
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
                    onClick={() => onOpenDynamicForm(dynamicFormCta)}
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
                    Ispunite zahtjev: {dynamicFormCta.name} →
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
