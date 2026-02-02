import type { AnalyticsEvent } from '../../analytics/types';
import { shortenSessionId } from '../utils/analytics';
import { categoryDisplayLabel } from '../utils/categories';

interface EventsTableProps {
  events: AnalyticsEvent[];
  title: string;
  showCategory?: boolean;
}

export function EventsTable({ events, title, showCategory = true }: EventsTableProps) {
  if (events.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        }}
      >
        <h3
          style={{
            margin: '0 0 1rem 0',
            fontSize: '1.125rem',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          {title}
        </h3>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
          No events found
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        padding: '2rem',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      }}
    >
      <h3
        style={{
          margin: '0 0 1.5rem 0',
          fontSize: '1.125rem',
          fontWeight: 600,
          color: '#111827',
        }}
      >
        {title} ({events.length})
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.75rem 1rem',
                  fontWeight: 600,
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Timestamp
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.75rem 1rem',
                  fontWeight: 600,
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Session
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.75rem 1rem',
                  fontWeight: 600,
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Question
              </th>
              {showCategory && (
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    fontWeight: 600,
                    color: '#374151',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Kategorija
                </th>
              )}
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.75rem 1rem',
                  fontWeight: 600,
                  color: '#374151',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <td
                  style={{
                    padding: '0.75rem 1rem',
                    color: '#6b7280',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {new Date(event.timestamp).toLocaleString()}
                </td>
                <td
                  style={{
                    padding: '0.75rem 1rem',
                    color: '#6b7280',
                    fontFamily: 'monospace',
                    fontSize: '0.8125rem',
                  }}
                >
                  {shortenSessionId(event.sessionId)}
                </td>
                <td
                  style={{
                    padding: '0.75rem 1rem',
                    color: '#111827',
                    maxWidth: '400px',
                    wordBreak: 'break-word',
                  }}
                >
                  {event.question}
                </td>
                {showCategory && (
                  <td
                    style={{
                      padding: '0.75rem 1rem',
                      color: '#6b7280',
                    }}
                  >
                    {categoryDisplayLabel(event.category)}
                  </td>
                )}
                <td
                  style={{
                    padding: '0.75rem 1rem',
                  }}
                >
                  <span
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: event.type === 'question' ? '#dbeafe' : '#fee2e2',
                      color: event.type === 'question' ? '#1e40af' : '#991b1b',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}
                  >
                    {event.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
