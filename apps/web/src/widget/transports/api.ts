import type { ChatTransport, ChatSendInput } from './types';

export class ApiTransport implements ChatTransport {
  // Store metadata from meta SSE events
  private _metadata: Record<string, any> | null = null;
  
  // Optional callback for when meta event arrives
  onMeta?: (meta: any) => void;

  get metadata(): Record<string, any> | null {
    return this._metadata;
  }

  async *sendMessage(input: ChatSendInput): AsyncGenerator<string, void, unknown> {
    const { cityId, apiBaseUrl, message, signal, conversationId, messageId, onAction, onMeta } = input;
    
    // Reset metadata for new request
    this._metadata = null;
    
    if (!apiBaseUrl) {
      throw new Error('apiBaseUrl is required for ApiTransport');
    }

    const url = `${apiBaseUrl}/grad/${cityId}/chat`;
    
    // Build request body with optional conversationId and messageId
    const body: { message: string; conversationId?: string; messageId?: string } = { message };
    if (conversationId) {
      body.conversationId = conversationId;
    }
    if (messageId) {
      body.messageId = messageId;
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('Content-Type') || '';

      // A) SSE (Server-Sent Events)
      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        let currentDataLines: string[] = []; // Accumulate data lines for current event

        try {
          while (true) {
            if (signal?.aborted) {
              reader.cancel();
              return;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              // Handle empty line (end of event) - process accumulated data
              if (line === '') {
                if (currentDataLines.length > 0) {
                  // Join all data lines with newlines (SSE spec)
                  const payload = currentDataLines.join('\n');
                  currentDataLines = [];
                  
                  // Handle action event
                  if (currentEvent === 'action') {
                    try {
                      const actionData = JSON.parse(payload);
                      if (onAction && actionData.type) {
                        onAction(actionData);
                      }
                    } catch {
                      // Ignore parse errors for action
                    }
                    currentEvent = '';
                    continue;
                  }
                  
                  // Handle meta event
                  if (currentEvent === 'meta') {
                    try {
                      const parsed = JSON.parse(payload);
                      this._metadata = parsed;
                      
                      // Always log meta event receipt (helpful for debugging citations)
                      console.log('[ApiTransport] Meta event received:', {
                        retrieved_docs_top3: parsed?.retrieved_docs_top3,
                        retrieved_docs_top3_length: Array.isArray(parsed?.retrieved_docs_top3) ? parsed.retrieved_docs_top3.length : 'not array',
                        hasOnMetaCallback: !!onMeta,
                      });
                      
                      // DEBUG: Detailed log meta event parsing
                      if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_CITATIONS') === '1') {
                        const payloadPreview = JSON.stringify(payload).substring(0, 80);
                        console.log('[ApiTransport] Meta event parsed (detailed):', {
                          event: 'meta',
                          payloadPreview,
                          retrieved_docs_top3: parsed?.retrieved_docs_top3,
                          retrieved_docs_top3_length: Array.isArray(parsed?.retrieved_docs_top3) ? parsed.retrieved_docs_top3.length : 'not array',
                          fullMeta: parsed,
                        });
                      }
                      
                      // Call onMeta callback from input if provided
                      if (onMeta) {
                        onMeta(parsed);
                      }
                      // Also call instance onMeta if set (for backward compatibility)
                      if (this.onMeta) {
                        this.onMeta(parsed);
                      }
                    } catch (e) {
                      // Log parse errors for debugging
                      console.error('[ApiTransport] Failed to parse meta event:', e, 'Payload:', payload.substring(0, 200));
                    }
                    currentEvent = '';
                    continue;
                  }
                  
                  // Handle message event (default event)
                  // Yield every payload exactly as received, except:
                  // - ignore the literal payload "[DONE]"
                  // - if payload starts with "[ERROR]" handle as error (existing behavior)
                  if (payload === '[DONE]') {
                    currentEvent = '';
                    continue;
                  }
                  if (payload.startsWith('[ERROR]')) {
                    currentEvent = '';
                    continue;
                  }
                  
                  // Debug logging (optional, controlled by localStorage)
                  if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_SSE') === '1') {
                    console.log('[SSE token]', JSON.stringify(payload));
                  }
                  
                  // Yield message payload exactly as received (no trimming)
                  yield payload;
                }
                currentEvent = '';
                continue;
              }
              
              // Handle event type (e.g., "event: meta", "event: action")
              if (line.startsWith('event: ')) {
                // Process any accumulated data from previous event before switching
                if (currentDataLines.length > 0 && currentEvent) {
                  const payload = currentDataLines.join('\n');
                  currentDataLines = [];
                  
                  if (currentEvent === 'meta') {
                    try {
                      const parsed = JSON.parse(payload);
                      this._metadata = parsed;
                      if (onMeta) onMeta(parsed);
                      if (this.onMeta) this.onMeta(parsed);
                    } catch {}
                  } else if (currentEvent === 'action') {
                    try {
                      const actionData = JSON.parse(payload);
                      if (onAction && actionData.type) onAction(actionData);
                    } catch {}
                  } else if (payload !== '[DONE]' && !payload.startsWith('[ERROR]')) {
                    yield payload;
                  }
                }
                currentEvent = line.slice(7).trim();
                currentDataLines = [];
                continue;
              }
              
              // Accumulate data lines
              if (line.startsWith('data: ')) {
                currentDataLines.push(line.slice(6));
                continue;
              }
            }
          }

          // Process any remaining accumulated data before checking buffer
          if (currentDataLines.length > 0 && currentEvent) {
            const payload = currentDataLines.join('\n');
            
            if (currentEvent === 'meta') {
              try {
                const parsed = JSON.parse(payload);
                this._metadata = parsed;
                if (onMeta) onMeta(parsed);
                if (this.onMeta) this.onMeta(parsed);
              } catch (e) {
                if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_CITATIONS') === '1') {
                  console.error('[ApiTransport] Failed to parse meta event (end of stream):', e, 'Payload:', payload);
                }
              }
            } else if (currentEvent === 'action') {
              try {
                const actionData = JSON.parse(payload);
                if (onAction && actionData.type) onAction(actionData);
              } catch {}
            } else if (payload !== '[DONE]' && !payload.startsWith('[ERROR]')) {
              if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_SSE') === '1') {
                console.log('[SSE token]', JSON.stringify(payload));
              }
              yield payload;
            }
          }

          // Process remaining buffer (legacy single-line handling)
          if (buffer.startsWith('data: ')) {
            const payload = buffer.slice(6);
            // Yield every payload exactly as received, except:
            // - ignore the literal payload "[DONE]"
            // - if payload starts with "[ERROR]" handle as error (existing behavior)
            if (payload === '[DONE]') {
              return;
            }
            if (payload.startsWith('[ERROR]')) {
              return;
            }
            
            // Debug logging (optional, controlled by localStorage)
            if (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_SSE') === '1') {
              console.log('[SSE token]', JSON.stringify(payload));
            }
            
            // Yield message payload exactly as received (no trimming)
            yield payload;
          }
        } finally {
          reader.releaseLock();
        }
        return;
      }

      // B) Stream with body
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            if (signal?.aborted) {
              reader.cancel();
              return;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              // Skip empty lines (but preserve whitespace in non-empty lines)
              if (line === '') continue;

              // Try to parse as JSON line
              try {
                const json = JSON.parse(line);
                // Support various response formats
                if (json.token) {
                  // Skip empty tokens, but preserve whitespace in non-empty tokens
                  if (json.token === '') continue;
                  yield json.token;
                } else if (json.content) {
                  // Skip empty content, but preserve whitespace in non-empty content
                  if (json.content === '') continue;
                  yield json.content;
                } else if (json.delta) {
                  // Skip empty deltas, but preserve whitespace in non-empty deltas
                  if (json.delta === '') continue;
                  yield json.delta;
                } else if (typeof json === 'string') {
                  // Skip empty strings, but preserve whitespace in non-empty strings
                  if (json === '') continue;
                  yield json;
                }
              } catch {
                // Not JSON, yield as raw text (preserve whitespace)
                yield line;
              }
            }
          }

          // Process remaining buffer
          // Skip empty buffer, but preserve whitespace in non-empty buffer
          if (buffer !== '') {
            try {
              const json = JSON.parse(buffer);
              if (json.token) {
                // Skip empty tokens, but preserve whitespace in non-empty tokens
                if (json.token === '') return;
                yield json.token;
              } else if (json.content) {
                // Skip empty content, but preserve whitespace in non-empty content
                if (json.content === '') return;
                yield json.content;
              } else if (json.delta) {
                // Skip empty deltas, but preserve whitespace in non-empty deltas
                if (json.delta === '') return;
                yield json.delta;
              } else if (typeof json === 'string') {
                // Skip empty strings, but preserve whitespace in non-empty strings
                if (json === '') return;
                yield json;
              }
            } catch {
              yield buffer;
            }
          }
        } finally {
          reader.releaseLock();
        }
        return;
      }

      // C) Fallback: JSON response
      const json = await response.json();
      if (json.answer) {
        yield json.answer;
      } else if (json.content) {
        yield json.content;
      } else {
        yield String(json);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Silently return on abort
      }
      throw error;
    }
  }
}
