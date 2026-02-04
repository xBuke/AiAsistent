import React, { useEffect, useRef, useState } from 'react';
import TypingIndicator from './TypingIndicator';
import { linkifyText } from '../utils/linkify';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

interface MessageListProps {
  messages: Message[];
  showTypingIndicator: boolean;
  lastCitations?: Array<{title?: string|null; source?: string|null; score?: number}> | null;
}

const MessageList: React.FC<MessageListProps> = ({ messages, showTypingIndicator, lastCitations }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [openCitationsId, setOpenCitationsId] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, showTypingIndicator]);

  const toggleCitations = (messageId: string) => {
    setOpenCitationsId(prev => prev === messageId ? null : messageId);
  };

  // Find the last assistant message ID
  const lastAssistantMessageId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i].id;
      }
    }
    return null;
  })();

  // Check if citations should be shown (only for last assistant message)
  const shouldShowCitations = lastCitations && Array.isArray(lastCitations) && lastCitations.length > 0 && lastAssistantMessageId !== null;
  const isCitationsOpen = openCitationsId === lastAssistantMessageId;;

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
        const isLastAssistant = message.id === lastAssistantMessageId;
        const showCitations = isLastAssistant && shouldShowCitations;

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
            {showCitations && lastCitations && (
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
                  Izvori ({lastCitations.length})
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
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#666',
                        fontStyle: 'italic',
                        marginBottom: '4px',
                      }}
                    >
                      Izvori su dokumenti iz baze projekta (službeni link ako postoji).
                    </div>
                    {lastCitations.map((doc, index) => {
                      const isUrl = doc.source && typeof doc.source === 'string' && doc.source.startsWith('http');
                      return (
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
                            {doc.title || 'Izvor'}
                          </div>
                          {isUrl ? (
                            <a
                              href={doc.source!}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#0b3a6e',
                                textDecoration: 'underline',
                                wordWrap: 'break-word',
                              }}
                            >
                              {doc.source}
                            </a>
                          ) : (
                            <div
                              style={{
                                color: '#666',
                                wordWrap: 'break-word',
                              }}
                            >
                              Interna dokumentacija projekta
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
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
