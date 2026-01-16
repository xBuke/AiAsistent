import { useState } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type AdminMessage = {
  role: string;
  content: string;
  created_at: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function AdminPage() {
  const [password, setPassword] = useState('');
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const fetchMessages = async () => {
    if (!password.trim()) {
      setError('Unesite lozinku');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/admin/messages`, {
        headers: {
          'x-admin-password': password,
        },
      });

      if (!response.ok) {
        let errorMessage = `Greška: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData?.error) {
            errorMessage = errorData.error === 'Unauthorized' 
              ? 'Neispravna lozinka' 
              : errorData.error;
          }
        } catch {
          // If JSON parsing fails, use default error message
        }
        
        setError(errorMessage);
        setIsAuthenticated(false);
        setMessages([]);
        setIsLoading(false);
        return;
      }

      // Parse JSON response safely
      let data: AdminMessage[] = [];
      try {
        data = await response.json();
        if (!Array.isArray(data)) {
          data = [];
        }
      } catch (parseError) {
        setError('Greška pri čitanju odgovora');
        setIsAuthenticated(false);
        setMessages([]);
        setIsLoading(false);
        return;
      }

      setMessages(data);
      setIsAuthenticated(true);
      setError('');
    } catch (err) {
      // Handle network errors and other exceptions
      const errorMessage = err instanceof Error ? err.message : 'Greška pri dohvaćanju poruka';
      setError('Nije moguće povezati se s serverom. Provjerite vezu.');
      setIsAuthenticated(false);
      setMessages([]);
    } finally {
      // Always clear loading state
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMessages();
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('hr-HR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const truncateContent = (content: string, maxLength: number = 200) => {
    if (!content || typeof content !== 'string') return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        maxWidth: '1200px',
        margin: '0 auto',
        backgroundColor: '#ffffff',
      }}
    >
      <header
        style={{
          padding: '1.5rem 1.5rem 1.25rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
            fontWeight: 600,
            color: '#111827',
            lineHeight: 1.2,
            marginBottom: '0.5rem',
          }}
        >
          Admin — Pregled pitanja građana
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            color: '#6b7280',
            lineHeight: 1.5,
          }}
        >
          Ovdje Grad vidi koja pitanja građani postavljaju AI asistentu.
        </p>
      </header>

      <div
        style={{
          padding: '2rem 1.5rem',
          backgroundColor: '#f9fafb',
          flex: 1,
          overflowY: 'auto',
        }}
      >
        {!isAuthenticated ? (
          <form
            onSubmit={handleSubmit}
            style={{
              maxWidth: '400px',
              margin: '2rem auto',
              padding: '2rem',
              backgroundColor: '#ffffff',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Lozinka:
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Unesite admin lozinku"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.9375rem',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#2563eb';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db';
                }}
              />
            </div>
            {error && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '0.875rem 1rem',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  borderLeft: '3px solid #dc2626',
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              style={{
                width: '100%',
                padding: '0.875rem',
                backgroundColor: isLoading || !password.trim() ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: isLoading || !password.trim() ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isLoading && password.trim()) {
                  e.currentTarget.style.backgroundColor = '#1d4ed8';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading && password.trim()) {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }
              }}
            >
              {isLoading ? 'Učitavanje...' : 'Prijavi se'}
            </button>
          </form>
        ) : (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.75rem',
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '0.25rem',
                  }}
                >
                  Pregled poruka
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    color: '#6b7280',
                  }}
                >
                  Ukupno: {messages.length} poruka
                </p>
              </div>
              <button
                onClick={fetchMessages}
                disabled={isLoading}
                style={{
                  padding: '0.625rem 1.25rem',
                  backgroundColor: isLoading ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#1d4ed8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }
                }}
              >
                {isLoading ? 'Učitavanje...' : 'Osvježi'}
              </button>
            </div>

            {error && (
              <div
                style={{
                  marginBottom: '1.5rem',
                  padding: '0.875rem 1rem',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  borderLeft: '3px solid #dc2626',
                }}
              >
                {error}
              </div>
            )}

            {messages.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '4rem 2rem',
                  color: '#6b7280',
                  fontSize: '0.9375rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                }}
              >
                Nema poruka
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th
                        style={{
                          padding: '0.875rem 1.25rem',
                          textAlign: 'left',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: '#374151',
                          borderBottom: '2px solid #e5e7eb',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Vrijeme
                      </th>
                      <th
                        style={{
                          padding: '0.875rem 1.25rem',
                          textAlign: 'left',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: '#374151',
                          borderBottom: '2px solid #e5e7eb',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Uloga
                      </th>
                      <th
                        style={{
                          padding: '0.875rem 1.25rem',
                          textAlign: 'left',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: '#374151',
                          borderBottom: '2px solid #e5e7eb',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Sadržaj
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((msg, index) => {
                      const isUser = msg.role === 'user';
                      const isAssistant = msg.role === 'assistant';
                      return (
                        <tr
                          key={index}
                          style={{
                            borderBottom: '1px solid #e5e7eb',
                            backgroundColor: isUser
                              ? '#eff6ff'
                              : isAssistant
                              ? '#faf5ff'
                              : '#ffffff',
                            transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = isUser
                              ? '#dbeafe'
                              : isAssistant
                              ? '#f3e8ff'
                              : '#f9fafb';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = isUser
                              ? '#eff6ff'
                              : isAssistant
                              ? '#faf5ff'
                              : '#ffffff';
                          }}
                        >
                          <td
                            style={{
                              padding: '1rem 1.25rem',
                              fontSize: '0.875rem',
                              color: '#6b7280',
                              whiteSpace: 'nowrap',
                              fontFamily: 'ui-monospace, monospace',
                            }}
                          >
                            {formatDate(msg.created_at)}
                          </td>
                          <td
                            style={{
                              padding: '1rem 1.25rem',
                              fontSize: '0.875rem',
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.375rem 0.75rem',
                                borderRadius: '0.375rem',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                backgroundColor: isUser
                                  ? '#3b82f6'
                                  : isAssistant
                                  ? '#9333ea'
                                  : '#6b7280',
                                color: '#ffffff',
                                textTransform: 'capitalize',
                              }}
                            >
                              {isUser ? 'Građanin' : isAssistant ? 'Asistent' : msg.role}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: '1rem 1.25rem',
                              fontSize: '0.9375rem',
                              color: '#111827',
                              maxWidth: '600px',
                              wordWrap: 'break-word',
                              lineHeight: 1.6,
                            }}
                          >
                            {truncateContent(msg.content)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async (messageOverride?: string) => {
    const messageText = messageOverride || input.trim();
    if (!messageText || isSending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!messageOverride) {
      setInput('');
    }
    setIsSending(true);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: messageText }),
      });

      const contentType = response.headers.get('content-type') || '';

      // Handle JSON response (non-streaming mode)
      if (contentType.includes('application/json')) {
        try {
          const data = await response.json();
          if (!response.ok) {
            setIsSending(false);
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
          }
          if (data.reply) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: data.reply }
                  : msg
              )
            );
          } else if (data.error) {
            setIsSending(false);
            throw new Error(data.error);
          }
          setIsSending(false);
          return;
        } catch (jsonError) {
          setIsSending(false);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          throw jsonError;
        }
      }

      if (!response.ok) {
        setIsSending(false);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle SSE streaming (default mode)
      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          setIsSending(false);
          throw new Error('No response body');
        }

        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);

                try {
                  const parsed = JSON.parse(data);
                  
                  if (parsed.done) {
                    setIsSending(false);
                    return;
                  }
                  
                  if (parsed.token) {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessage.id
                          ? { ...msg, content: msg.content + parsed.token }
                          : msg
                      )
                    );
                  } else if (parsed.content) {
                    // Fallback for old format
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessage.id
                          ? { ...msg, content: msg.content + parsed.content }
                          : msg
                      )
                    );
                  } else if (parsed.error) {
                    setIsSending(false);
                    throw new Error(parsed.error);
                  }
                } catch (e) {
                  // Ignore JSON parse errors for incomplete chunks
                }
              }
            }
          }

          setIsSending(false);
          return;
        } catch (streamError) {
          setIsSending(false);
          throw streamError;
        }
      }

      // Unknown content type
      setIsSending(false);
      throw new Error(`Unexpected content type: ${contentType}`);
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: 'Došlo je do pogreške. Pokušajte ponovno.' }
            : msg
        )
      );
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    handleSend(question);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: '#ffffff',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '1.25rem 1rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
            fontWeight: 600,
            color: '#111827',
            lineHeight: 1.2,
          }}
        >
          AI asistent — Grad Ploče
        </h1>
        <p
          style={{
            margin: '0.5rem 0 0 0',
            fontSize: '0.875rem',
            color: '#6b7280',
            lineHeight: 1.4,
          }}
        >
          Odgovori temeljeni na službenim dokumentima
        </p>
      </header>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          backgroundColor: '#f9fafb',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '0.875rem',
              padding: '2rem 1rem',
            }}
          >
            Postavite pitanje o službenim dokumentima Grada Ploča
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: 'min(85%, 600px)',
              padding: '0.875rem 1rem',
              borderRadius: '0.75rem',
              backgroundColor: msg.role === 'user' ? '#2563eb' : '#ffffff',
              color: msg.role === 'user' ? '#ffffff' : '#111827',
              boxShadow: msg.role === 'assistant' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
              lineHeight: 1.5,
              fontSize: '0.9375rem',
              wordWrap: 'break-word',
            }}
          >
            {msg.content || (msg.role === 'assistant' && isSending ? '...' : '')}
          </div>
        ))}
        {isSending && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '0.5rem 1rem',
              color: '#6b7280',
              fontSize: '0.875rem',
              fontStyle: 'italic',
            }}
          >
            Odgovaram...
          </div>
        )}
      </div>

      {/* Suggested questions */}
      {messages.length === 0 && (
        <div
          style={{
            padding: '0 1rem 0.75rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            backgroundColor: '#ffffff',
          }}
        >
          <div
            style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              marginBottom: '0.25rem',
            }}
          >
            Predložena pitanja:
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <button
              onClick={() => handleSuggestedQuestion('Koje su ključne stavke proračuna Grada Ploča za 2024.?')}
              disabled={isSending}
              style={{
                padding: '0.625rem 1rem',
                backgroundColor: '#f3f4f6',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                cursor: isSending ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                textAlign: 'left',
                transition: 'background-color 0.2s',
                opacity: isSending ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSending) {
                  e.currentTarget.style.backgroundColor = '#e5e7eb';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
            >
              Koje su ključne stavke proračuna Grada Ploča za 2024.?
            </button>
            <button
              onClick={() => handleSuggestedQuestion('Što je navedeno u obrazloženju proračuna za 2024.?')}
              disabled={isSending}
              style={{
                padding: '0.625rem 1rem',
                backgroundColor: '#f3f4f6',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                cursor: isSending ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                textAlign: 'left',
                transition: 'background-color 0.2s',
                opacity: isSending ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSending) {
                  e.currentTarget.style.backgroundColor = '#e5e7eb';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
            >
              Što je navedeno u obrazloženju proračuna za 2024.?
            </button>
            <button
              onClick={() => handleSuggestedQuestion('Kome se građani mogu obratiti vezano uz proračun i izvršenje?')}
              disabled={isSending}
              style={{
                padding: '0.625rem 1rem',
                backgroundColor: '#f3f4f6',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                cursor: isSending ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                textAlign: 'left',
                transition: 'background-color 0.2s',
                opacity: isSending ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSending) {
                  e.currentTarget.style.backgroundColor = '#e5e7eb';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
            >
              Kome se građani mogu obratiti vezano uz proračun i izvršenje?
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          padding: '1rem',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Postavite pitanje..."
          disabled={isSending}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '0.9375rem',
            opacity: isSending ? 0.6 : 1,
            outline: 'none',
            transition: 'border-color 0.2s',
            minWidth: 0,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#2563eb';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#d1d5db';
          }}
        />
        <button
          onClick={handleSend}
          disabled={isSending || !input.trim()}
          style={{
            padding: '0.75rem 1.25rem',
            backgroundColor: isSending || !input.trim() ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: isSending || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.9375rem',
            fontWeight: 500,
            transition: 'background-color 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          Pošalji
        </button>
      </div>
    </div>
  );
}

function App() {
  // Check pathname on each render
  const pathname = window.location.pathname;

  if (pathname === '/admin') {
    return <AdminPage />;
  }

  return <ChatPage />;
}

export default App;
