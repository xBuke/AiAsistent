import './StatCard.css';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
}

export function StatCard({ title, value, subtitle, trend }: StatCardProps) {
  return (
    <div className="admin-card admin-stat-card">
      <div className="admin-stat-card__title">{title}</div>
      <div className="admin-stat-card__value">{value}</div>
      {subtitle && <div className="admin-stat-card__subtitle">{subtitle}</div>}
      {typeof trend === 'number' && (
        <div className={`admin-stat-card__trend ${trend >= 0 ? 'admin-stat-card__trend--positive' : 'admin-stat-card__trend--negative'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}
