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
}

const MessageList: React.FC<MessageListProps> = ({ messages, showTypingIndicator }) => {
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
        // Get citations from message metadata for assistant messages
        const docs = message.role === 'assistant' ? message.metadata?.retrieved_docs_top3 : null;
        const hasCitations = Array.isArray(docs) && docs.length > 0;
        const isCitationsOpen = openCitationsId === message.id;
        
        // DEBUG: Log rendering check for assistant messages
        if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_CITATIONS') === '1' && message.role === 'assistant') {
          console.log('[MessageList] Rendering assistant message:', {
            messageId: message.id,
            hasMetadata: !!message.metadata,
            metadata: message.metadata,
            retrieved_docs_top3: message.metadata?.retrieved_docs_top3,
            retrieved_docs_top3_length: Array.isArray(message.metadata?.retrieved_docs_top3) ? message.metadata.retrieved_docs_top3.length : 'not array',
            docs,
            hasCitations,
            contentLength: message.content?.length || 0,
          });
        }

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
