import React from 'react';

const TypingIndicator: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '12px 16px',
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#999',
          animation: 'typing 1.4s infinite',
          animationDelay: '0s',
        }}
      />
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#999',
          animation: 'typing 1.4s infinite',
          animationDelay: '0.2s',
        }}
      />
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#999',
          animation: 'typing 1.4s infinite',
          animationDelay: '0.4s',
        }}
      />
      <style>
        {`
          @keyframes typing {
            0%, 60%, 100% {
              opacity: 0.3;
              transform: translateY(0);
            }
            30% {
              opacity: 1;
              transform: translateY(-8px);
            }
          }
        `}
      </style>
    </div>
  );
};

export default TypingIndicator;
