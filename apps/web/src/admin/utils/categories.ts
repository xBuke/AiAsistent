import type { Category } from '../../analytics/categorize';

/**
 * Display-only mapping: internal category values → civic Croatian labels.
 * Used only in the UI; backend, API, DB, and stored values are unchanged.
 */
export const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  // Requested civic mappings
  issue_reporting: 'Prijava komunalnih problema',
  general_info: 'Opće informacije',
  administration: 'Administrativni upiti',
  documents: 'Obrasci i dokumenti',
  events: 'Događanja u gradu',
  other: 'Ostalo',
  // Backend Category values (display-only labels)
  contacts_hours: 'Kontakti i radno vrijeme',
  forms_requests: 'Obrasci i dokumenti',
  utilities_communal: 'Komunalne usluge',
  budget_finance: 'Proračun i financije',
  tenders_jobs: 'Natječaji i zapošljavanje',
  acts_decisions: 'Odluke i akti',
  permits_solutions: 'Dozvole i rješenja',
  social_support: 'Socijalna prava i potpore',
  events_news: 'Događanja u gradu',
  general: 'Opće informacije',
  spam: 'Spam',
};

/**
 * Returns a human-friendly Croatian label for display. Accepts any string
 * (e.g. from API/events); unknown values show "Ostalo" so no raw internal
 * values are visible.
 */
export function categoryDisplayLabel(value: string | undefined | null): string {
  if (value == null || value === '') return '—';
  return CATEGORY_DISPLAY_LABELS[value] ?? 'Ostalo';
}

/**
 * Returns a human-readable Croatian label for a category (typed).
 */
export function categoryLabel(cat: Category): string {
  return categoryDisplayLabel(cat);
}

/**
 * Returns an optional ordering number for a category (lower = earlier in sort)
 * If not specified, categories will be sorted alphabetically by label
 */
export function categoryOrder(cat: Category): number {
  const orders: Record<Category, number> = {
    contacts_hours: 1,
    forms_requests: 2,
    utilities_communal: 3,
    budget_finance: 4,
    tenders_jobs: 5,
    acts_decisions: 6,
    permits_solutions: 7,
    social_support: 8,
    events_news: 9,
    issue_reporting: 10,
    general: 11,
    spam: 12,
  };
  return orders[cat] ?? 99;
}
