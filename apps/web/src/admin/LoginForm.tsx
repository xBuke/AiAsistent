import { useEffect, useState, FormEvent } from 'react';
import './LoginForm.css';

interface LoginFormProps {
  onSubmit: (cityCode: string, password: string) => void;
  error?: string;
  warning?: string;
  isLoading?: boolean;
  cityCode: string;
}

export function LoginForm({ onSubmit, error, warning, isLoading = false, cityCode }: LoginFormProps) {
  const [localCityCode, setLocalCityCode] = useState(cityCode);
  const [password, setPassword] = useState('');

  useEffect(() => {
    setLocalCityCode(cityCode);
  }, [cityCode]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.trim() && localCityCode.trim()) {
      onSubmit(localCityCode.trim(), password);
    }
  };

  return (
    <div className="admin-login">
      <form onSubmit={handleSubmit} className="admin-login__card">
        <div className="admin-login__brand">Civis</div>
        <div className="admin-login__subtitle">Admin sučelje</div>

        <div className="admin-login__field">
          <label htmlFor="cityCode" className="admin-login__label">
            Grad / City code
          </label>
          <div className="admin-login__city">npr. zagreb ili superadmin</div>
        </div>
        <input
          id="cityCode"
          type="text"
          value={localCityCode}
          onChange={(e) => setLocalCityCode(e.target.value)}
          placeholder="Unesite city code"
          disabled={isLoading}
          className="admin-input admin-login__input"
        />
        <div className="admin-login__field">
          <label htmlFor="password" className="admin-login__label">
            Lozinka
          </label>
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

        <button
          type="submit"
          disabled={isLoading || !password.trim() || !localCityCode.trim()}
          className="admin-btn-primary admin-login__submit"
        >
          {isLoading ? 'Loading...' : 'Login'}
        </button>

        {error && <div className="admin-login__error">{error}</div>}
      </form>
    </div>
  );
}
