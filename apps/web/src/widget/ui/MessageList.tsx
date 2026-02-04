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

  const getCitations = (message: Message) => {
    const retrievedDocs = message.metadata?.retrieved_docs_top3;
    if (!Array.isArray(retrievedDocs) || retrievedDocs.length === 0) {
      return null;
    }
    return retrievedDocs;
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
        const citations = getCitations(message);
        const showCitations = message.role === 'assistant' && citations;
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
            {showCitations && (
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
                  Izvori ({citations.length})
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
                    {citations.map((doc: { title: string | null; source: string | null; score: number }, index: number) => (
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
                        {doc.source ? (
                          <a
                            href={doc.source}
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
                            Nepoznati izvor
                          </div>
                        )}
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
