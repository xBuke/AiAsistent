import type { AnalyticsEvent } from '../../analytics/types';

/**
 * Remove PII from event data for export
 * - No IP addresses (not present in AnalyticsEvent)
 * - No emails (not present in AnalyticsEvent)
 * - sessionId can be truncated
 */
function sanitizeEventForExport(event: AnalyticsEvent): Omit<AnalyticsEvent, 'sessionId'> & { sessionId: string } {
  // Truncate sessionId to first 8 characters
  const truncatedSessionId = event.sessionId.length > 8 
    ? `${event.sessionId.substring(0, 8)}...` 
    : event.sessionId;

  return {
    ...event,
    sessionId: truncatedSessionId,
  };
}

/**
 * Export data as JSON
 */
export function exportAsJSON(data: unknown, filename: string = 'report.json'): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(data: Array<Record<string, unknown>>): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const headerRow = headers.join(',');
  
  const rows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Escape commas and quotes in CSV
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
}

/**
 * Export data as CSV
 */
export function exportAsCSV(data: Array<Record<string, unknown>>, filename: string = 'report.csv'): void {
  const csvStr = arrayToCSV(data);
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export events array as JSON (with PII sanitization)
 */
export function exportEventsAsJSON(events: AnalyticsEvent[], filename: string = 'events.json'): void {
  const sanitized = events.map(sanitizeEventForExport);
  exportAsJSON(sanitized, filename);
}

/**
 * Export events array as CSV (with PII sanitization)
 */
export function exportEventsAsCSV(events: AnalyticsEvent[], filename: string = 'events.csv'): void {
  const sanitized = events.map(sanitizeEventForExport);
  exportAsCSV(sanitized, filename);
}
