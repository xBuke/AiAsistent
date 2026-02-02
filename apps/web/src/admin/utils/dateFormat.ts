/**
 * Format date/time to Croatian format: DD.MM.YYYY HH:mm
 * Uses Europe/Zagreb timezone
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  // Format to DD.MM.YYYY HH:mm in Europe/Zagreb timezone
  const formatter = new Intl.DateTimeFormat('hr-HR', {
    timeZone: 'Europe/Zagreb',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(d);
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

/**
 * Format date/time for message timestamps (shorter format)
 */
export function formatMessageTime(date: Date | string | null | undefined): string {
  return formatDateTime(date);
}

/**
 * Relative time for list items, e.g. "prije 12 min", "prije 1 h", "jučer"
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const ms = now - d.getTime();
  const min = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (min < 1) return 'upravo';
  if (min < 60) return `prije ${min} min`;
  if (h < 24) return `prije ${h} h`;
  if (days === 1) return 'jučer';
  if (days < 7) return `prije ${days} d`;
  return formatDateTime(d);
}
