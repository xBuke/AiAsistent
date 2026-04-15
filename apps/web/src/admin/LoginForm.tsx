import { useState, FormEvent } from 'react';
import './LoginForm.css';

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
    <div className="admin-login">
      <form onSubmit={handleSubmit} className="admin-login__card">
        <div className="admin-login__brand">Civis</div>
        <div className="admin-login__subtitle">Admin sučelje</div>

        <div className="admin-login__field">
          <label htmlFor="password" className="admin-login__label">
            Lozinka
          </label>
          <div className="admin-login__city">{cityId}</div>
        </div>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter admin password"
          disabled={isLoading}
          className="admin-input admin-login__input"
        />

        {warning && <div className="admin-login__warning">{warning}</div>}

        <button type="submit" disabled={isLoading || !password.trim()} className="admin-btn-primary admin-login__submit">
          {isLoading ? 'Loading...' : 'Login'}
        </button>

        {error && <div className="admin-login__error">{error}</div>}
      </form>
    </div>
  );
}
