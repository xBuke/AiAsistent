interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
}

export function StatCard({ title, value, subtitle }: StatCardProps) {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        padding: '1.5rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb',
      }}
    >
      <div
        style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#6b7280',
          marginBottom: '0.5rem',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: '2rem',
          fontWeight: 600,
          color: '#111827',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: '0.75rem',
            color: '#9ca3af',
            marginTop: '0.25rem',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}
