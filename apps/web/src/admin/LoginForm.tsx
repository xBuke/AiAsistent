import { useState, FormEvent } from 'react';

interface LoginFormProps {
  onSubmit: (password: string) => void;
  error?: string;
  warning?: string;
  isLoading?: boolean;
  cityId: string;
}

export function LoginForm({ onSubmit, error, warning, isLoading = false, cityId }: LoginFormProps) {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      onSubmit(password);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        maxWidth: '400px',
        margin: '2rem auto',
        padding: '2rem',
        backgroundColor: '#ffffff',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      }}
    >
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor="password"
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#374151',
          }}
        >
          Lozinka:
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter admin password"
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.9375rem',
            outline: 'none',
            opacity: isLoading ? 0.6 : 1,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#2563eb';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#d1d5db';
          }}
        />
      </div>
      {warning && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '0.875rem 1rem',
            backgroundColor: '#fef3c7',
            color: '#92400e',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            borderLeft: '3px solid #f59e0b',
          }}
        >
          {warning}
        </div>
      )}
      {error && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '0.875rem 1rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            borderLeft: '3px solid #dc2626',
          }}
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={isLoading || !password.trim()}
        style={{
          width: '100%',
          padding: '0.875rem',
          backgroundColor: isLoading || !password.trim() ? '#9ca3af' : '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '0.375rem',
          fontSize: '0.9375rem',
          fontWeight: 500,
          cursor: isLoading || !password.trim() ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isLoading && password.trim()) {
            e.currentTarget.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading && password.trim()) {
            e.currentTarget.style.backgroundColor = '#2563eb';
          }
        }}
      >
        {isLoading ? 'Loading...' : 'Login'}
      </button>
    </form>
  );
}
