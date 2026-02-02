export type Category =
  | "contacts_hours"
  | "forms_requests"
  | "utilities_communal"
  | "budget_finance"
  | "tenders_jobs"
  | "acts_decisions"
  | "permits_solutions"
  | "social_support"
  | "events_news"
  | "issue_reporting"
  | "general"
  | "spam";

export interface CategorizationResult {
  category: Category;
  isSpam: boolean;
  needsHuman: boolean;
}

// Keyword mappings for categories
const categoryKeywords: Record<Category, string[]> = {
  contacts_hours: ["kontakt", "telefon", "email", "mail", "radno vrijeme", "adresa", "ured"],
  forms_requests: ["obrazac", "zahtjev", "ispuniti", "predati", "pdf", "prilog"],
  utilities_communal: ["komunal", "otpad", "smeće", "rasvjeta", "voda", "kanal", "cesta", "parking"],
  budget_finance: ["proračun", "rebalans", "nabava", "izvješće", "financ"],
  tenders_jobs: ["natječaj", "zapošlj", "posao", "prijava", "oglas"],
  acts_decisions: ["odluka", "pravilnik", "statut", "sjednica", "vijeće"],
  permits_solutions: ["dozvola", "rješenje", "građev", "legaliz", "suglasnost"],
  social_support: ["potpora", "stipend", "socijal", "naknada"],
  events_news: ["događaj", "manifest", "obavijest", "novost"],
  issue_reporting: ["prijaviti", "kvar", "problem", "rupa", "ne radi", "curi", "buka"],
  general: [],
  spam: [],
};

// Common profanity words (small set)
const profanityWords = ["kurcina", "jebem", "pizda", "serem", "jebote"];

/**
 * Check if text contains spam signals
 */
function isSpamText(text: string): boolean {
  // Normalize text to lowercase for checking
  const lowerText = text.toLowerCase().trim();
  
  // Very short nonsense (<= 2 chars) OR mostly non-letters
  if (lowerText.length <= 2) {
    // Check if it's mostly non-letters
    const letterCount = (lowerText.match(/[a-zčćđšž]/gi) || []).length;
    if (letterCount / lowerText.length < 0.5) {
      return true;
    }
  }
  
  // Check for many repeated characters (e.g., "aaaaaa", "!!!!!!!")
  const repeatedPattern = /(.)\1{4,}/; // Same character repeated 5+ times
  if (repeatedPattern.test(text)) {
    return true;
  }
  
  // Check for profanity
  for (const word of profanityWords) {
    if (lowerText.includes(word)) {
      return true;
    }
  }
  
  // Check for mostly non-letters in longer text
  if (lowerText.length > 2) {
    const letterCount = (lowerText.match(/[a-zčćđšž]/gi) || []).length;
    if (letterCount / lowerText.length < 0.3) {
      return true;
    }
  }
  
  return false;
}

/**
 * Count keyword matches in text for a category
 */
function countKeywordMatches(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let count = 0;
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      count++;
    }
  }
  return count;
}

/**
 * Check if text needs human attention
 */
function checkNeedsHuman(texts: string[]): boolean {
  const combinedText = texts.join(" ").toLowerCase();
  
  // Check if issue_reporting category is matched
  const issueKeywords = categoryKeywords.issue_reporting;
  const issueMatches = countKeywordMatches(combinedText, issueKeywords);
  
  // Check for "prijava" + "problem/kvar"
  const hasPrijava = combinedText.includes("prijava");
  const hasProblem = combinedText.includes("problem") || combinedText.includes("kvar");
  
  // Check for urgency words
  const urgencyWords = ["hitno", "urgentno", "hitna"];
  const hasUrgency = urgencyWords.some(word => combinedText.includes(word));
  
  // needsHuman if issue_reporting matched OR (prijava + problem/kvar) OR urgency
  if (issueMatches > 0 || (hasPrijava && hasProblem) || hasUrgency) {
    return true;
  }
  
  return false;
}

/**
 * Categorize a conversation based on user messages
 */
export function categorizeConversation(userTexts: string[]): CategorizationResult {
  // Check for spam first
  const spamCount = userTexts.filter(text => isSpamText(text)).length;
  const isSpam = spamCount > 0;
  
  // If spam is detected, return spam category
  if (isSpam) {
    return {
      category: "spam",
      isSpam: true,
      needsHuman: false,
    };
  }
  
  // Combine all user texts for keyword matching
  const combinedText = userTexts.join(" ");
  
  // Calculate scores for each category (excluding spam and general)
  const categoryScores: Record<Category, number> = {
    contacts_hours: 0,
    forms_requests: 0,
    utilities_communal: 0,
    budget_finance: 0,
    tenders_jobs: 0,
    acts_decisions: 0,
    permits_solutions: 0,
    social_support: 0,
    events_news: 0,
    issue_reporting: 0,
    general: 0,
    spam: 0,
  };
  
  // Count keyword matches for each category
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (category === "general" || category === "spam") continue;
    categoryScores[category as Category] = countKeywordMatches(combinedText, keywords);
  }
  
  // Find category with highest score
  let maxScore = 0;
  let selectedCategory: Category = "general";
  
  for (const [category, score] of Object.entries(categoryScores)) {
    if (category === "spam") continue; // Already handled
    if (score > maxScore) {
      maxScore = score;
      selectedCategory = category as Category;
    }
  }
  
  // Check if needs human attention
  const needsHuman = checkNeedsHuman(userTexts);
  
  return {
    category: selectedCategory,
    isSpam: false,
    needsHuman,
  };
}
