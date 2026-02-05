export type BackendEvent = {
  type: string;
  conversationId?: string;
  messageId?: string;
  role?: "user" | "assistant";
  content?: string;
  question?: string;
  category?: string;
  needsHuman?: boolean;
  ticket?: {
    status?: string;
    ticketRef?: string;
    contact?: { name?: string; phone?: string; email?: string; location?: string; note?: string; consentAt?: number };
    department?: string;
    urgent?: boolean;
  };
  intake?: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    description: string;
    contact_note?: string;
    consent_given: boolean;
    consent_text: string;
    consent_timestamp: number;
  };
  meta?: { fallback?: boolean; fallbackCount?: number; latencyMs?: number; sourcesCount?: number };
  metadata?: Record<string, any>; // Debug trace metadata for assistant messages
  timestamp: number;
};

/**
 * Post an analytics event to the backend
 * Best-effort: failures are caught and logged, but do not throw
 */
export async function postBackendEvent(input: {
  apiBaseUrl?: string;
  cityId: string;
  event: BackendEvent;
}): Promise<void> {
  // If apiBaseUrl is missing/empty, do nothing
  if (!input.apiBaseUrl || input.apiBaseUrl.trim() === '') {
    return;
  }

  const { apiBaseUrl, cityId, event } = input;
  const url = `${apiBaseUrl}/grad/${cityId}/events`;

  // Use AbortController with ~2.5s timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, 2500);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.debug('[eventsClient] POST failed:', response.status, response.statusText);
    }
  } catch (error) {
    // Errors should be caught and logged with console.debug only (do not throw)
    if (error instanceof Error && error.name === 'AbortError') {
      console.debug('[eventsClient] Request timeout');
    } else {
      console.debug('[eventsClient] POST error:', error);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
