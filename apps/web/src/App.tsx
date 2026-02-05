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
                <strong>💡 Vrijednost za Grad:</strong> Ovdje Grad dobiva uvid u to što građane najčešće zanima i koje informacije traže. U budućnosti ovaj sustav omogućuje analizu trendova i prioriteta, što pomaže u donošenju informiranih odluka i poboljšanju komunikacije s građanima.
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

// Floating Chat Component - reuses chat logic
function FloatingChat({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
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

                if (data.trim() === '[DONE]') {
                  setIsSending(false);
                  requestAnimationFrame(() => {
                    scrollToBottomSmooth();
                  });
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  
                  if (parsed.done) {
                    setIsSending(false);
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
                    requestAnimationFrame(() => {
                      scrollToBottomSmooth();
                    });
                  } else if (parsed.content) {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessage.id
                          ? { ...msg, content: msg.content + parsed.content }
                          : msg
                      )
                    );
                    requestAnimationFrame(() => {
                      scrollToBottomSmooth();
                    });
                  } else if (parsed.error) {
                    setIsSending(false);
                    throw new Error(parsed.error);
                  }
                } catch (e) {
                  if (data && data.trim() !== '') {
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessage.id
                          ? { ...msg, content: msg.content + data }
                          : msg
                      )
                    );
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

  const scrollToBottomImmediate = () => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  };

  const scrollToBottomSmooth = () => {
    if (isNearBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkIsNearBottom();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        scrollToBottomSmooth();
      });
    }
  }, [messages]);

  useEffect(() => {
    if (isSending) {
      requestAnimationFrame(() => {
        scrollToBottomImmediate();
      });
    }
  }, [isSending]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay for mobile */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 998,
        }}
      />
      
      {/* Chat Panel */}
      <div
        style={{
          position: 'fixed',
          bottom: '80px',
          right: 'clamp(10px, 2vw, 20px)',
          left: 'clamp(10px, 2vw, auto)',
          width: 'min(380px, calc(100vw - 20px))',
          height: 'min(600px, calc(100vh - 120px))',
          maxHeight: 'calc(100vh - 120px)',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 1000,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 600,
                color: '#111827',
              }}
            >
              Demo AI asistent
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              color: '#6b7280',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
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
                maxWidth: 'min(85%, 300px)',
                padding: '0.875rem 1rem',
                borderRadius: '0.75rem',
                backgroundColor: msg.role === 'user' ? '#2563eb' : '#ffffff',
                color: msg.role === 'user' ? '#ffffff' : '#111827',
                boxShadow: msg.role === 'assistant' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                lineHeight: 1.5,
                fontSize: '0.875rem',
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
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
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
                fontSize: '0.875rem',
                opacity: isSending ? 0.6 : 1,
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#2563eb';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db';
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={isSending || !input.trim()}
              style={{
                padding: '0.75rem 1.25rem',
                backgroundColor: isSending || !input.trim() ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: isSending || !input.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'background-color 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              Pošalji
            </button>
          </div>
        </div>
      </div>
      
      {/* Chat Bubble Button (Close) */}
      <button
        onClick={() => onClose()}
        style={{
          position: 'fixed',
          bottom: 'clamp(10px, 2vw, 20px)',
          right: 'clamp(10px, 2vw, 20px)',
          width: 'clamp(48px, 8vw, 56px)',
          height: 'clamp(48px, 8vw, 56px)',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: '#2563eb',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          zIndex: 999,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        }}
        aria-label="Zatvori chat"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18 6L6 18M6 6L18 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  );
}

// Copyable Example Component
function CopyableExample({ text, label, lang }: { text: string; label: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const isCroatian = lang === 'hr' || (!lang && typeof window !== 'undefined' && window.location.pathname === '/');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        // Ignore
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.8125rem',
            color: '#6b7280',
            marginBottom: '0.25rem',
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 'clamp(0.9375rem, 1.5vw, 1rem)',
            color: '#111827',
            lineHeight: 1.5,
            wordBreak: 'break-word',
            cursor: 'text',
            userSelect: 'text',
          }}
          onClick={(e) => {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(e.currentTarget);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }}
        >
          {text}
        </div>
      </div>
      <button
        onClick={handleCopy}
        style={{
          padding: '0.5rem 0.75rem',
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: copied ? '#10b981' : '#2563eb',
          backgroundColor: copied ? '#d1fae5' : '#eff6ff',
          border: '1px solid',
          borderColor: copied ? '#10b981' : '#2563eb',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.2s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!copied) {
            e.currentTarget.style.backgroundColor = '#dbeafe';
          }
        }}
        onMouseLeave={(e) => {
          if (!copied) {
            e.currentTarget.style.backgroundColor = '#eff6ff';
          }
        }}
      >
        {copied ? (isCroatian ? '✓ Kopirano' : '✓ Copied') : (isCroatian ? 'Kopiraj' : 'Copy')}
      </button>
    </div>
  );
}

// English Landing Page Component
function EnglishLandingPage() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Disable old FloatingChat on civisai.mangai.hr (use new widget instead)
  const isCivisAi = typeof window !== 'undefined' && window.location.hostname === 'civisai.mangai.hr';
  const shouldShowOldChat = !isCivisAi;

  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        backgroundColor: '#ffffff',
        position: 'relative',
      }}
    >
      {/* Language Switcher */}
      <div
        style={{
          position: 'absolute',
          top: 'clamp(1rem, 2vw, 1.5rem)',
          right: 'clamp(1rem, 2vw, 1.5rem)',
        }}
      >
        <a
          href="/"
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.9375rem',
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 500,
            border: '1px solid #2563eb',
            borderRadius: '0.375rem',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#eff6ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          HR
        </a>
      </div>

      {/* Hero Section */}
      <section
        style={{
          padding: 'clamp(3rem, 8vw, 6rem) clamp(1rem, 4vw, 2rem)',
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            fontWeight: 700,
            color: '#111827',
            margin: '0 0 1.5rem 0',
            lineHeight: 1.2,
          }}
        >
          Civis
        </h1>
        <p
          style={{
            fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)',
            color: '#4b5563',
            margin: '0 0 1.5rem 0',
            lineHeight: 1.6,
            maxWidth: '800px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          A citizen-facing AI assistant and an admin inbox for municipalities.
        </p>

        {/* Notice/Disclaimer */}
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto 2rem auto',
            padding: '1rem 1.5rem',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '0.5rem',
            textAlign: 'left',
          }}
        >
          <p
            style={{
              fontSize: 'clamp(0.9375rem, 1.5vw, 1rem)',
              color: '#0369a1',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            <strong>Notice:</strong> This demo reflects workflows shaped by Croatian public-sector standards and operating practices.
          </p>
        </div>

        {/* Document Scope Note */}
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto 2rem auto',
            padding: '1rem 1.5rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '0.5rem',
            textAlign: 'left',
          }}
        >
          <p
            style={{
              fontSize: 'clamp(0.9375rem, 1.5vw, 1rem)',
              color: '#92400e',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            The assistant is grounded on a small set of demo/mock documents (not official documents).
          </p>
        </div>

        {/* Testing Instructions */}
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto 2rem auto',
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
            textAlign: 'left',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(1.125rem, 2vw, 1.25rem)',
              fontWeight: 600,
              color: '#111827',
              margin: '0 0 1rem 0',
            }}
          >
            Testing Instructions
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: '1.5rem',
              fontSize: 'clamp(0.9375rem, 1.5vw, 1rem)',
              color: '#374151',
              lineHeight: 1.8,
            }}
          >
            <li>Open the chat bubble</li>
            <li>Ask a question about city services</li>
            <li>Submit a request (it will create a ticket/reference)</li>
            <li>Open the admin dashboard to review tickets</li>
          </ul>
        </div>

        {/* What to Try Section */}
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto 2rem auto',
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
            textAlign: 'left',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(1.125rem, 2vw, 1.25rem)',
              fontWeight: 600,
              color: '#111827',
              margin: '0 0 1rem 0',
            }}
          >
            What to try
          </h2>
          <CopyableExample
            text="How can AI help me as a citizen?"
            label="Example 1 (general info)"
          />
          <CopyableExample
            text="Who should I contact about a communal issue?"
            label="Example 2 (service guidance)"
          />
          <CopyableExample
            text="I need to report a problem"
            label="Example 3 (ticket flow)"
          />
          <p
            style={{
              fontSize: 'clamp(0.8125rem, 1.5vw, 0.875rem)',
              color: '#6b7280',
              margin: '1rem 0 0 0',
              lineHeight: 1.6,
              fontStyle: 'italic',
            }}
          >
            These examples are in English for clarity. The assistant UI and responses are in Croatian.
          </p>
        </div>

        {/* Important Note */}
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto 2rem auto',
            padding: '1rem 1.5rem',
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '0.5rem',
            textAlign: 'left',
          }}
        >
          <p
            style={{
              fontSize: 'clamp(0.9375rem, 1.5vw, 1rem)',
              color: '#92400e',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            <strong>Important:</strong> The chat and admin UI are currently in Croatian.
          </p>
        </div>

        {/* Call-to-Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            justifyContent: 'center',
            marginTop: '2.5rem',
            padding: '0 1rem',
          }}
        >
          <a
            href="https://civisai.mangai.hr/admin/demo"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: 'clamp(0.875rem, 2vw, 1rem) clamp(1.5rem, 4vw, 2.5rem)',
              fontSize: 'clamp(0.9375rem, 2vw, 1.125rem)',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'background-color 0.2s, transform 0.2s',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              textDecoration: 'none',
              display: 'inline-block',
              minWidth: 'min(200px, calc(100% - 1rem))',
              textAlign: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1d4ed8';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Open Admin Dashboard
          </a>
          <button
            onClick={() => {
              // Try to open new widget if available, otherwise fall back to old chat
              if (typeof window !== 'undefined' && (window as any).CivisWidget?.open) {
                (window as any).CivisWidget.open();
              } else if (shouldShowOldChat) {
                setIsChatOpen(true);
              }
            }}
            style={{
              padding: 'clamp(0.875rem, 2vw, 1rem) clamp(1.5rem, 4vw, 2.5rem)',
              fontSize: 'clamp(0.9375rem, 2vw, 1.125rem)',
              fontWeight: 600,
              color: '#2563eb',
              backgroundColor: 'transparent',
              border: '2px solid #2563eb',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'background-color 0.2s, transform 0.2s',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              minWidth: 'min(200px, calc(100% - 1rem))',
              textAlign: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#eff6ff';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Try the Widget
          </button>
        </div>
      </section>

      {/* Floating Chat - disabled on civisai.mangai.hr (use new widget instead) */}
      {shouldShowOldChat && (
        <>
          {isChatOpen ? (
            <FloatingChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
          ) : (
            <button
              onClick={() => setIsChatOpen(true)}
              style={{
                position: 'fixed',
                bottom: 'clamp(10px, 2vw, 20px)',
                right: 'clamp(10px, 2vw, 20px)',
                width: 'clamp(48px, 8vw, 56px)',
                height: 'clamp(48px, 8vw, 56px)',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: '#2563eb',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                zIndex: 999,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
              aria-label="Open chat"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Landing Page Component (Croatian)
function ChatPage() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Disable old FloatingChat on civisai.mangai.hr (use new widget instead)
  const isCivisAi = typeof window !== 'undefined' && window.location.hostname === 'civisai.mangai.hr';
  const shouldShowOldChat = !isCivisAi;

  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        backgroundColor: '#ffffff',
        position: 'relative',
      }}
    >
      {/* Language Switcher */}
      <div
        style={{
          position: 'absolute',
          top: 'clamp(1rem, 2vw, 1.5rem)',
          right: 'clamp(1rem, 2vw, 1.5rem)',
        }}
      >
        <a
          href="/en"
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.9375rem',
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 500,
            border: '1px solid #2563eb',
            borderRadius: '0.375rem',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#eff6ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          EN
        </a>
      </div>

      {/* Hero Section */}
      <section
        style={{
          padding: 'clamp(3rem, 8vw, 6rem) clamp(1rem, 4vw, 2rem)',
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            fontWeight: 700,
            color: '#111827',
            margin: '0 0 1.5rem 0',
            lineHeight: 1.2,
          }}
        >
          Civis
        </h1>
        <p
          style={{
            fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)',
            color: '#4b5563',
            margin: '0 0 1.5rem 0',
            lineHeight: 1.6,
            maxWidth: '800px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Digitalni asistent koji komunicira s građanima koristeći službene dokumente grada.
        </p>
        <p
          style={{
            fontSize: 'clamp(1rem, 2vw, 1.125rem)',
            color: '#6b7280',
            margin: '0 0 2.5rem 0',
            lineHeight: 1.6,
            maxWidth: '700px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Ovaj asistent bit će implementiran direktno na službenoj web stranici grada kao chat bubble, omogućujući građanima brz i jednostavan pristup informacijama o gradu.
        </p>

        {/* Notice/Disclaimer */}
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto 2rem auto',
            padding: '1rem 1.5rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '0.5rem',
            textAlign: 'left',
          }}
        >
          <p
            style={{
              fontSize: 'clamp(0.9375rem, 1.5vw, 1rem)',
              color: '#92400e',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Napomena: AI asistent trenutno koristi ograničen skup demo / testnih dokumenata i ne predstavlja službene dokumente Grada.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={() => {
              // Try to open new widget if available, otherwise fall back to old chat
              if (typeof window !== 'undefined' && (window as any).CivisWidget?.open) {
                (window as any).CivisWidget.open();
              } else if (shouldShowOldChat) {
                setIsChatOpen(true);
              }
            }}
            style={{
              padding: 'clamp(0.875rem, 2vw, 1rem) clamp(2rem, 4vw, 2.5rem)',
              fontSize: 'clamp(1rem, 2vw, 1.125rem)',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'background-color 0.2s, transform 0.2s',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1d4ed8';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Iskusite kako izgleda AI asistent za građane
          </button>
          <a
            href="https://civisai.mangai.hr/admin/demo"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: 'clamp(0.875rem, 2vw, 1rem) clamp(2rem, 4vw, 2.5rem)',
              fontSize: 'clamp(1rem, 2vw, 1.125rem)',
              fontWeight: 600,
              color: '#2563eb',
              backgroundColor: 'transparent',
              border: '2px solid #2563eb',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'background-color 0.2s, transform 0.2s',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              textDecoration: 'none',
              display: 'inline-block',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#eff6ff';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Admin Dashboard
          </a>
        </div>
      </section>

      {/* What to Try Section */}
      <section
        style={{
          padding: 'clamp(2rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem)',
          backgroundColor: '#ffffff',
        }}
      >
        <div
          style={{
            maxWidth: '700px',
            margin: '0 auto',
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
            textAlign: 'left',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(1.125rem, 2vw, 1.25rem)',
              fontWeight: 600,
              color: '#111827',
              margin: '0 0 1rem 0',
            }}
          >
            Što možete probati
          </h2>
          <CopyableExample
            text="Kako mi AI može pomoći kao građaninu?"
            label="Primjer 1 (općenito)"
            lang="hr"
          />
          <CopyableExample
            text="Kome se mogu obratiti za komunalni problem?"
            label="Primjer 2 (usmjeravanje)"
            lang="hr"
          />
          <CopyableExample
            text="Želim prijaviti problem"
            label="Primjer 3 (prijava)"
            lang="hr"
          />
          <p
            style={{
              fontSize: 'clamp(0.8125rem, 1.5vw, 0.875rem)',
              color: '#6b7280',
              margin: '1rem 0 0 0',
              lineHeight: 1.6,
              fontStyle: 'italic',
            }}
          >
            Primjeri su tu da brže isprobate asistenta.
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        style={{
          padding: 'clamp(3rem, 6vw, 5rem) clamp(1rem, 4vw, 2rem)',
          backgroundColor: '#f9fafb',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
              fontWeight: 700,
              color: '#111827',
              textAlign: 'center',
              margin: '0 0 clamp(2rem, 4vw, 3rem) 0',
            }}
          >
            Kako funkcionira
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'clamp(1.5rem, 3vw, 2rem)',
              maxWidth: '1000px',
              margin: '0 auto',
            }}
          >
            {/* Step 1 */}
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: 'clamp(1.5rem, 3vw, 2rem)',
                borderRadius: '0.75rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                }}
              >
                1
              </div>
              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: '#111827',
                  margin: '0 0 0.75rem 0',
                }}
              >
                Građanin postavlja pitanje
              </h3>
              <p
                style={{
                  fontSize: '1rem',
                  color: '#6b7280',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Građanin postavlja pitanje putem chat bubble-a na web stranici grada, bilo kada i bilo gdje.
              </p>
            </div>

            {/* Step 2 */}
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: 'clamp(1.5rem, 3vw, 2rem)',
                borderRadius: '0.75rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                }}
              >
                2
              </div>
              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: '#111827',
                  margin: '0 0 0.75rem 0',
                }}
              >
                AI asistent odgovara
              </h3>
              <p
                style={{
                  fontSize: '1rem',
                  color: '#6b7280',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                AI asistent odgovara na temelju službenih dokumenata grada, osiguravajući točne i ažurne informacije.
              </p>
            </div>

            {/* Step 3 */}
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: 'clamp(1.5rem, 3vw, 2rem)',
                borderRadius: '0.75rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                }}
              >
                3
              </div>
              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: '#111827',
                  margin: '0 0 0.75rem 0',
                }}
              >
                Admin sučelje
              </h3>
              <p
                style={{
                  fontSize: '1rem',
                  color: '#6b7280',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Svi upiti i zahtjevi građana pojavljuju se u admin sučelju gradske uprave za praćenje i analizu.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Notice */}
      <section
        style={{
          padding: 'clamp(2rem, 4vw, 3rem) clamp(1rem, 4vw, 2rem)',
          backgroundColor: '#ffffff',
        }}
      >
        <div
          style={{
            maxWidth: '800px',
            margin: '0 auto',
            padding: 'clamp(1.25rem, 3vw, 1.5rem)',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '0.5rem',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: 'clamp(0.9375rem, 2vw, 1rem)',
              color: '#0369a1',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            <strong>Napomena:</strong> Ovo je demonstracijska verzija sustava. U stvarnoj implementaciji, asistent je dio službene web stranice grada.
          </p>
        </div>
      </section>

      {/* Floating Chat - disabled on civisai.mangai.hr (use new widget instead) */}
      {shouldShowOldChat && (
        <>
          {isChatOpen ? (
            <FloatingChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
          ) : (
            <button
              onClick={() => setIsChatOpen(true)}
              style={{
                position: 'fixed',
                bottom: 'clamp(10px, 2vw, 20px)',
                right: 'clamp(10px, 2vw, 20px)',
                width: 'clamp(48px, 8vw, 56px)',
                height: 'clamp(48px, 8vw, 56px)',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: '#2563eb',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                zIndex: 999,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
              aria-label="Otvori chat"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/admin/:cityId" element={<AdminApp />} />
      <Route path="/admin/login" element={<Navigate to="/admin/demo" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/demo" replace />} />
      <Route path="/en" element={<EnglishLandingPage />} />
      <Route path="/" element={<ChatPage />} />
    </Routes>
  );
}

export default App;
