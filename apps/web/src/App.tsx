import { useState, useRef, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminApp } from './admin/AdminApp';

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

  // Calculate dashboard statistics from messages
  const calculateStats = () => {
    const userMessages = messages.filter(msg => msg.role === 'user');
    const totalQuestions = userMessages.length;
    
    // Count questions today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const questionsToday = userMessages.filter(msg => {
      try {
        const msgDate = new Date(msg.created_at);
        msgDate.setHours(0, 0, 0, 0);
        return msgDate.getTime() === today.getTime();
      } catch {
        return false;
      }
    }).length;
    
    // Count questions in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const questionsLast7Days = userMessages.filter(msg => {
      try {
        const msgDate = new Date(msg.created_at);
        return msgDate >= sevenDaysAgo;
      } catch {
        return false;
      }
    }).length;
    
    // Find most common topic (simple keyword-based)
    const topicKeywords: { [key: string]: string[] } = {
      'Kontakt': ['kontakt', 'telefon', 'email', 'adresa', 'radno vrijeme', 'ured'],
      'Dokumenti': ['dokument', 'potvrda', 'izjava', 'formular', 'zahtjev'],
      'Proračun': ['proračun', 'budžet', 'financije', 'troškovi'],
      'Usluge': ['usluga', 'servis', 'prijava', 'zahtjev'],
      'Informacije': ['informacije', 'pitanje', 'što', 'kako', 'gdje'],
    };
    
    const topicCounts: { [key: string]: number } = {};
    userMessages.forEach(msg => {
      const content = msg.content.toLowerCase();
      let found = false;
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(keyword => content.includes(keyword))) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          found = true;
          break;
        }
      }
      if (!found) {
        topicCounts['Ostalo'] = (topicCounts['Ostalo'] || 0) + 1;
      }
    });
    
    const mostCommonTopic = Object.keys(topicCounts).length > 0
      ? Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0][0]
      : 'N/A';
    
    return {
      totalQuestions,
      questionsToday,
      questionsLast7Days,
      mostCommonTopic,
    };
  };

  // Detect topic from message content (keyword-based)
  const detectTopic = (content: string): string => {
    if (!content || typeof content !== 'string') return 'Ostalo';
    
    const lowerContent = content.toLowerCase();
    const topicKeywords: { [key: string]: string[] } = {
      'Kontakt': ['kontakt', 'telefon', 'email', 'adresa', 'radno vrijeme', 'ured'],
      'Dokumenti': ['dokument', 'potvrda', 'izjava', 'formular', 'zahtjev'],
      'Proračun': ['proračun', 'budžet', 'financije', 'troškovi'],
      'Usluge': ['usluga', 'servis', 'prijava', 'zahtjev'],
      'Informacije': ['informacije', 'pitanje', 'što', 'kako', 'gdje'],
    };
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => lowerContent.includes(keyword))) {
        return topic;
      }
    }
    
    return 'Ostalo';
  };

  const stats = calculateStats();

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
            {/* Dashboard Header with Summary Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '1.75rem',
              }}
            >
              <div
                style={{
                  backgroundColor: '#ffffff',
                  padding: '1.25rem',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #2563eb',
                }}
              >
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  Ukupno pitanja
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {stats.totalQuestions}
                </div>
              </div>
              
              <div
                style={{
                  backgroundColor: '#ffffff',
                  padding: '1.25rem',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #10b981',
                }}
              >
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  Najčešća tema
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {stats.mostCommonTopic}
                </div>
              </div>
              
              <div
                style={{
                  backgroundColor: '#ffffff',
                  padding: '1.25rem',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #f59e0b',
                }}
              >
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  Pitanja danas
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {stats.questionsToday}
                </div>
              </div>
              
              <div
                style={{
                  backgroundColor: '#ffffff',
                  padding: '1.25rem',
                  borderRadius: '0.5rem',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                  borderLeft: '4px solid #9333ea',
                }}
              >
                <div
                  style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  Zadnjih 7 dana
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {stats.questionsLast7Days}
                </div>
              </div>
            </div>

            {/* Explanatory Info Box */}
            <div
              style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '0.5rem',
                padding: '1rem 1.25rem',
                marginBottom: '1.75rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.9375rem',
                  color: '#1e40af',
                  lineHeight: 1.6,
                }}
              >
                <strong>💡 Vrijednost za Grad:</strong> Ovdje Grad Ploče dobiva uvid u to što građane najčešće zanima i koje informacije traže. U budućnosti ovaj sustav omogućuje analizu trendova i prioriteta, što pomaže u donošenju informiranih odluka i poboljšanju komunikacije s građanima.
              </div>
            </div>

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
                        Tema
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
                              fontSize: '0.875rem',
                            }}
                          >
                            {isUser ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.375rem 0.75rem',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 500,
                                  backgroundColor: '#f3f4f6',
                                  color: '#374151',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                {detectTopic(msg.content)}
                              </span>
                            ) : (
                              <span
                                style={{
                                  color: '#9ca3af',
                                  fontStyle: 'italic',
                                }}
                              >
                                —
                              </span>
                            )}
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

            {/* Coming Soon / Future Features Section */}
            <div
              style={{
                marginTop: '2.5rem',
                padding: '1.5rem',
                backgroundColor: '#ffffff',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <h3
                style={{
                  margin: '0 0 1rem 0',
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>🚀</span>
                <span>Buduće mogućnosti</span>
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem',
                    borderLeft: '3px solid #2563eb',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Grupiranje tema
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: '#6b7280',
                      lineHeight: 1.5,
                    }}
                  >
                    Automatsko grupiranje sličnih pitanja i identifikacija glavnih tema koje građane zanimaju.
                  </div>
                </div>
                
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem',
                    borderLeft: '3px solid #10b981',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Analiza trendova
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: '#6b7280',
                      lineHeight: 1.5,
                    }}
                  >
                    Praćenje promjena u interesima građana kroz vrijeme i identifikacija sezonskih obrazaca.
                  </div>
                </div>
                
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.375rem',
                    borderLeft: '3px solid #f59e0b',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#111827',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Podrška odlukama
                  </div>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      color: '#6b7280',
                      lineHeight: 1.5,
                    }}
                  >
                    Preporuke za prioritizaciju resursa i poboljšanja na temelju analize pitanja građana.
                  </div>
                </div>
              </div>
            </div>
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
  const [logoError, setLogoError] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  
  // Default city ID for Ploče
  const cityId = 'ploce';

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
    
    // Immediately scroll to bottom after user message
    requestAnimationFrame(() => {
      scrollToBottomImmediate();
    });

    setIsSending(true);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
    };

    setMessages((prev) => [...prev, assistantMessage]);
    
    // Scroll again when typing indicator appears
    requestAnimationFrame(() => {
      scrollToBottomImmediate();
    });

    try {
      const chatUrl = `${API_BASE_URL}/grad/${cityId}/chat`;
      const response = await fetch(chatUrl, {
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
            // Scroll when response completes (only if near bottom)
            requestAnimationFrame(() => {
              scrollToBottomSmooth();
            });
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

                // Handle completion signal
                if (data.trim() === '[DONE]') {
                  setIsSending(false);
                  // Scroll when response completes (only if near bottom)
                  requestAnimationFrame(() => {
                    scrollToBottomSmooth();
                  });
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  
                  if (parsed.done) {
                    setIsSending(false);
                    // Scroll when response completes (only if near bottom)
                    requestAnimationFrame(() => {
                      scrollToBottomSmooth();
                    });
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
                    // Scroll on streaming updates (only if near bottom)
                    requestAnimationFrame(() => {
                      scrollToBottomSmooth();
                    });
                  } else if (parsed.content) {
                    // Fallback for old format
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessage.id
                          ? { ...msg, content: msg.content + parsed.content }
                          : msg
                      )
                    );
                    // Scroll on streaming updates (only if near bottom)
                    requestAnimationFrame(() => {
                      scrollToBottomSmooth();
                    });
                  } else if (parsed.error) {
                    setIsSending(false);
                    throw new Error(parsed.error);
                  }
                } catch (e) {
                  // If JSON parse fails, treat as raw token string (server sends raw tokens)
                  if (data && data.trim() !== '') {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessage.id
                          ? { ...msg, content: msg.content + data }
                          : msg
                      )
                    );
                    // Scroll on streaming updates (only if near bottom)
                    requestAnimationFrame(() => {
                      scrollToBottomSmooth();
                    });
                  }
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

  // Check if user is near bottom of chat (within 150px threshold)
  const checkIsNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) {
      isNearBottomRef.current = true;
      return true;
    }
    const threshold = 150;
    const isNear = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    isNearBottomRef.current = isNear;
    return isNear;
  };

  // Immediate scroll to bottom (for send/typing indicator)
  const scrollToBottomImmediate = () => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  };

  // Smooth scroll to bottom (for streaming updates, only if near bottom)
  const scrollToBottomSmooth = () => {
    if (isNearBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  // Handle scroll events to track if user is near bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkIsNearBottom();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll on message updates (streaming) - only if near bottom
  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottomSmooth();
      });
    }
  }, [messages]);

  // Auto-scroll when typing indicator appears
  useEffect(() => {
    if (isSending) {
      requestAnimationFrame(() => {
        scrollToBottomImmediate();
      });
    }
  }, [isSending]);

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
          borderBottom: '2px solid #00A6E6',
          backgroundColor: '#ffffff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          {!logoError ? (
            <img
              src="/logo.svg"
              alt="Grad Ploče logo"
              style={{
                height: '28px',
                width: 'auto',
                objectFit: 'contain',
              }}
              onError={() => setLogoError(true)}
            />
          ) : (
            <img
              src="/logo.png"
              alt="Grad Ploče logo"
              style={{
                height: '28px',
                width: 'auto',
                objectFit: 'contain',
              }}
            />
          )}
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
        </div>
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
        ref={messagesContainerRef}
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
            Kako ti mogu pomoći?
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
              backgroundColor: msg.role === 'user' ? '#00A6E6' : '#ffffff',
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
        {/* Bottom sentinel for auto-scroll */}
        <div ref={bottomRef} />
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
              onClick={() => handleSuggestedQuestion('Kako mi možeš pomoći kao AI asistent Grada Ploča?')}
              disabled={isSending}
              style={{
                padding: '0.625rem 1rem',
                backgroundColor: '#f3f4f6',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: '0.625rem',
                cursor: isSending ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                opacity: isSending ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSending) {
                  e.currentTarget.style.backgroundColor = '#fef3c7';
                  e.currentTarget.style.borderColor = '#FDDC00';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Kako mi možeš pomoći kao AI asistent Grada Ploča?
            </button>
            <button
              onClick={() => handleSuggestedQuestion('Što sve trenutno možeš raditi za građane Grada Ploča?')}
              disabled={isSending}
              style={{
                padding: '0.625rem 1rem',
                backgroundColor: '#f3f4f6',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: '0.625rem',
                cursor: isSending ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                opacity: isSending ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSending) {
                  e.currentTarget.style.backgroundColor = '#fef3c7';
                  e.currentTarget.style.borderColor = '#FDDC00';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Što sve trenutno možeš raditi za građane Grada Ploča?
            </button>
            <button
              onClick={() => handleSuggestedQuestion('Što ćeš moći raditi u budućnosti?')}
              disabled={isSending}
              style={{
                padding: '0.625rem 1rem',
                backgroundColor: '#f3f4f6',
                color: '#111827',
                border: '1px solid #e5e7eb',
                borderRadius: '0.625rem',
                cursor: isSending ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                opacity: isSending ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSending) {
                  e.currentTarget.style.backgroundColor = '#fef3c7';
                  e.currentTarget.style.borderColor = '#FDDC00';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Što ćeš moći raditi u budućnosti?
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
          placeholder="Npr. Kako mogu kontaktirati gradsku upravu?"
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
            e.target.style.borderColor = '#00A6E6';
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
            backgroundColor: isSending || !input.trim() ? '#9ca3af' : '#00A6E6',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: isSending || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.9375rem',
            fontWeight: 500,
            transition: 'background-color 0.2s, box-shadow 0.2s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (!isSending && input.trim()) {
              e.currentTarget.style.backgroundColor = '#0099D1';
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0, 166, 230, 0.2)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSending && input.trim()) {
              e.currentTarget.style.backgroundColor = '#00A6E6';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          Pošalji
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/admin/:cityId" element={<AdminApp />} />
      <Route path="/admin/login" element={<Navigate to="/admin/demo" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/demo" replace />} />
      <Route path="/" element={<ChatPage />} />
    </Routes>
  );
}

export default App;
