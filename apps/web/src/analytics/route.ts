import type { Department } from './tickets';
import type { Category } from './categorize';

/**
 * Suggest department based on ticket category
 * Returns undefined for spam (no suggestion)
 */
export function suggestDepartment(category?: string): Department | undefined {
  if (!category) return undefined;
  
  const categoryToDepartment: Record<Category, Department | undefined> = {
    contacts_hours: "admin",
    forms_requests: "admin",
    utilities_communal: "communal",
    issue_reporting: "communal",
    budget_finance: "finance",
    social_support: "social",
    tenders_jobs: "admin",
    acts_decisions: "admin",
    permits_solutions: "admin",
    events_news: "admin",
    general: "other",
    spam: undefined,
  };
  
  return categoryToDepartment[category as Category];
}
