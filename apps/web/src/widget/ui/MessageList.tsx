import React, { useEffect, useRef } from 'react';
import TypingIndicator from './TypingIndicator';
import { linkifyText } from '../utils/linkify';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface MessageListProps {
  messages: Message[];
  showTypingIndicator: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ messages, showTypingIndicator }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, showTypingIndicator]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {messages.map((message) => (
        <div
          key={message.id}
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
      ))}
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
