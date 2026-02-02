export type TicketStatus = "needs_human" | "contact_requested" | "closed";

export type ContactRequest = {
  name?: string;
  phone?: string;
  email?: string;
  note?: string;
  location?: string;
  consent: boolean;
  consentAt: number;
  ticketRef: string;
};

export type Department = "communal" | "finance" | "admin" | "social" | "other";

export type Ticket = {
  cityId: string;
  conversationId: string;
  createdAt: number;
  updatedAt: number;
  status: TicketStatus;
  category?: string;
  department?: Department;
  needsHuman: boolean;
  fallbackCount: number;
  contact?: ContactRequest;
  internalNotes?: string[];
  urgent?: boolean; // Manual override for urgent priority
};
