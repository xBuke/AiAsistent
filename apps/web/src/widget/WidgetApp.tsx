import React, { useState, useRef, useEffect } from 'react';
import type { WidgetConfig } from './init';
import BubbleButton from './ui/BubbleButton';
import ChatPanel from './ui/ChatPanel';
import type { Message } from './ui/MessageList';
import { t } from './i18n';
import { ApiTransport } from './transports/api';
import { MockTransport } from './transports/mock';
import type { ChatTransport } from './transports/types';
import {
  emitEvent,
  emitConversationStart,
  emitMessage,
  emitConversationEnd,
  createConversationId,
} from './analytics';
import { postBackendEvent, type BackendEvent } from './utils/eventsClient';
import { categorizeConversation } from '../analytics/categorize';
import { upsertTicket, getTicket, getRecentFallbackCount, reopenTicket } from '../analytics/store';
import type { Ticket } from '../analytics/tickets';
import type { ContactData } from './ui/ContactHandoff';
import type { TicketIntakeData } from './ui/TicketIntakeForm';
import { getDefaultNovorodenoData, type NovorodenoDijeteFormData } from './ui/NovorodenoDijeteWizard';
import { getDefaultJednokratnaData, type JednokratnaNovcanaPomocFormData } from './ui/JednokratnaNovcanaPomocWizard';

const NOVORODENO_WIZARD_STORAGE_KEY = 'civis_novorodeno_wizard';
const JEDNOKRATNA_WIZARD_STORAGE_KEY = 'civis_jednokratna_wizard';

/** Default attachments (no file upload) for jednokratna PDF template */
const JEDNOKRATNA_ATTACHMENTS_DEFAULT = {
  oi_ili_rodni_listovi: false,
  izjava_kucanstvo: false,
  dokaz_primanja: false,
  potvrda_poslodavca: false,
  odresci_mirovine: false,
  uvjerenje_hzz: false,
  potvrda_porezna: false,
  potvrda_hzss: false,
  ugovor_podstanarstvo: false,
  lijecnicka_dokumentacija: false,
  iban_potvrda: false,
};

/** Extract year from DD.MM.YYYY. for payload (fallback when godina_rodjenja empty) */
function extractYearFromDatum(datum: string): string {
  const digits = (datum || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(4, 8) : '';
}

/** Build request body for POST /forms/submit from wizard data */
function buildNovorodenoSubmitPayload(
  citySlug: string,
  data: NovorodenoDijeteFormData
): { city_slug: string; type: string; data: Record<string, unknown> } {
  const datum = (data.dijete.datum_rodjenja || '').trim();
  const godina = (data.dijete.godina_rodjenja || '').trim() || extractYearFromDatum(datum);
  return {
    city_slug: citySlug,
    type: 'novorodeno_dijete',
    data: {
      podnositelj: {
        ime_prezime: data.podnositelj.ime_prezime.trim(),
        adresa: data.podnositelj.adresa.trim(),
        kontakt: data.podnositelj.kontakt.trim(),
        oib: data.identifikacija.oib.trim(),
        iban: data.identifikacija.iban.trim(),
      },
      dijete: {
        datum_rodjenja: datum,
        godina_rodjenja: godina,
        mjesto_rodjenja: data.dijete.mjesto_rodjenja,
      },
      flags: {
        roditelj_izvan_ploca: data.posebne_okolnosti.roditelj_izvan_ploca === true,
        za_trece_ili_sljedece: data.posebne_okolnosti.za_trece_ili_sljedece === true,
      },
      meta: {
        mjesto_podnosenja: data.meta.mjesto_podnosenja,
        datum_podnosenja: data.meta.datum_podnosenja,
        ref_broj: '',
      },
    },
  };
}

/** Build request body for POST /forms/submit (jednokratna_novcana_pomoc) */
function buildJednokratnaSubmitPayload(
  citySlug: string,
  data: JednokratnaNovcanaPomocFormData
): { city_slug: string; type: string; data: Record<string, unknown> } {
  const o = data.okolnosti;
  return {
    city_slug: citySlug,
    type: 'jednokratna_novcana_pomoc',
    data: {
      podnositelj: {
        ime_prezime: data.podnositelj.ime_prezime.trim(),
        adresa: data.podnositelj.adresa.trim(),
        kontakt: data.podnositelj.kontakt.trim(),
        oib: data.identifikacija.oib.trim(),
        iban: data.identifikacija.iban.trim(),
      },
      razlog_zamolbe: data.razlog_zamolbe.trim(),
      flags: {
        zdravstveni_razlog: o.zdravstveni_razlog === true,
        gubitak_prihoda: o.gubitak_prihoda === true,
        podstanar: o.podstanar === true,
        je_podstanar: o.podstanar === true,
      },
      meta: {
        mjesto_podnosenja: data.meta.mjesto_podnosenja,
        datum_podnosenja: data.meta.datum_podnosenja,
        ref_broj: '',
      },
      status_podnositelja: 'zaposlen',
      attachments: JEDNOKRATNA_ATTACHMENTS_DEFAULT,
    },
  };
}

interface WidgetAppProps {
  config: WidgetConfig;
}

const WidgetApp: React.FC<WidgetAppProps> = ({ config }) => {
  // Runtime override: force 'demo' cityId on gradai.mangai.hr hostname
  const cityId = (typeof window !== 'undefined' && window.location.hostname === 'gradai.mangai.hr') 
    ? 'demo' 
    : config.cityId;
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasReceivedFirstToken, setHasReceivedFirstToken] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turnIndex, setTurnIndex] = useState<number>(0);
  const [userMessages, setUserMessages] = useState<string[]>([]);
  const [ticket, setTicket] = useState<Ticket | undefined>(undefined);
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [intakeSubmitted, setIntakeSubmitted] = useState(false);
  const [ctaDismissedSession, setCtaDismissedSession] = useState(false);
  const [ctaDismissedJednokratnaSession, setCtaDismissedJednokratnaSession] = useState(false);
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [novorodenoWizardStep, setNovorodenoWizardStep] = useState(1);
  const [novorodenoWizardData, setNovorodenoWizardData] = useState<NovorodenoDijeteFormData>(() => getDefaultNovorodenoData());
  const [jednokratnaWizardStep, setJednokratnaWizardStep] = useState(1);
  const [jednokratnaWizardData, setJednokratnaWizardData] = useState<JednokratnaNovcanaPomocFormData>(() => getDefaultJednokratnaData());

  // Expose global API for controlling widget (for CTA buttons)
  useEffect(() => {
    (window as any).CivisWidget = {
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    };
    
    return () => {
      // Cleanup: remove global API if widget unmounts
      if ((window as any).CivisWidget) {
        delete (window as any).CivisWidget;
      }
    };
  }, []);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamTimeoutRef = useRef<number | null>(null);
  const hasReceivedFirstTokenRef = useRef<boolean>(false);
  const metaRef = useRef<Record<string, any> | null>(null);

  // Helper to resolve metadata from multiple sources in priority order
  function resolveMeta(transport: ChatTransport, traceMetadata?: Record<string, any>): Record<string, any> | undefined {
    const tmeta = transport instanceof ApiTransport ? (transport.metadata || undefined) : undefined;
    return metaRef.current || tmeta || traceMetadata;
  }

  // Helper to normalize Croatian text for matching (lowercase, trim, strip diacritics)
  function normalizeCroatianText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Strip diacritics
  }

  // Helper to normalize text for matching (lowercase, trim)
  function normalizeText(text: string): string {
    return text.toLowerCase().trim();
  }

  // Check if message matches ticket intent phrases
  function matchesTicketIntent(text: string): boolean {
    const normalized = normalizeCroatianText(text);
    const normalizedEn = normalizeText(text);
    const croatianPhrases = [
      'prijaviti problem',
      'prijaviti kvar',
      'prijava problema',
      'prijava kvara',
      'trebam prijaviti',
      'zelim prijaviti',
    ];
    const englishPhrases = [
      'i need to report a problem',
    ];
    return croatianPhrases.some(phrase => normalized.includes(phrase)) ||
           englishPhrases.some(phrase => normalizedEn.includes(phrase));
  }

  // Choose transport based on config. Never use MockTransport in production.
  const isProd = import.meta.env.PROD;
  const apiUnavailableInProd = isProd && !config.apiBaseUrl;
  const useMock = !config.apiBaseUrl && !isProd;
  const transport: ChatTransport = useMock ? new MockTransport() : new ApiTransport();

  // Initialize conversation when panel opens for the first time or starts new conversation
  useEffect(() => {
    if (isOpen && conversationId === null) {
      const newConversationId = createConversationId();
      setConversationId(newConversationId);
      setTurnIndex(0);
      setUserMessages([]);
      setTicket(undefined);
      setShowIntakeForm(false);
      setIntakeSubmitted(false);
      setCtaDismissedSession(false);
      setCtaDismissedJednokratnaSession(false);

      // Restore wizard from session if present (keep progress across widget close/reopen)
      if (typeof sessionStorage !== 'undefined') {
        try {
          const storedNovo = sessionStorage.getItem(NOVORODENO_WIZARD_STORAGE_KEY);
          if (storedNovo) {
            const parsed = JSON.parse(storedNovo) as { step?: number; data?: NovorodenoDijeteFormData };
            if (parsed?.data && typeof parsed.step === 'number' && parsed.step >= 1 && parsed.step <= 5) {
              setActiveForm('novorodeno_dijete');
              setNovorodenoWizardStep(parsed.step);
              setNovorodenoWizardData(parsed.data);
              setJednokratnaWizardStep(1);
              setJednokratnaWizardData(getDefaultJednokratnaData());
              emitConversationStart(cityId, newConversationId, config.apiBaseUrl);
              return;
            }
          }
          const storedJed = sessionStorage.getItem(JEDNOKRATNA_WIZARD_STORAGE_KEY);
          if (storedJed) {
            const parsed = JSON.parse(storedJed) as { step?: number; data?: JednokratnaNovcanaPomocFormData };
            if (parsed?.data && typeof parsed.step === 'number' && parsed.step >= 1 && parsed.step <= 5) {
              setActiveForm('jednokratna_novcana_pomoc');
              setJednokratnaWizardStep(parsed.step);
              setJednokratnaWizardData(parsed.data);
              setNovorodenoWizardStep(1);
              setNovorodenoWizardData(getDefaultNovorodenoData());
              emitConversationStart(cityId, newConversationId, config.apiBaseUrl);
              return;
            }
          }
        } catch {
          // ignore
        }
      }
      setActiveForm(null);
      setNovorodenoWizardStep(1);
      setNovorodenoWizardData(getDefaultNovorodenoData());
      setJednokratnaWizardStep(1);
      setJednokratnaWizardData(getDefaultJednokratnaData());

      // Emit conversation_start event
      emitConversationStart(cityId, newConversationId, config.apiBaseUrl);
    }
  }, [isOpen, conversationId, cityId]);

  // Check for existing ticket when conversationId changes
  useEffect(() => {
    if (conversationId) {
      const existingTicket = getTicket(cityId, conversationId);
      setTicket(existingTicket);
    }
  }, [conversationId, cityId]);

  // Compute needsHuman and create/update ticket after each user message
  useEffect(() => {
    if (conversationId && userMessages.length > 0) {
      const existingTicket = getTicket(cityId, conversationId);
      const categorization = categorizeConversation(userMessages);
      
      // If ticket is closed and new message arrives, reopen it
      if (existingTicket && existingTicket.status === 'closed') {
        const fallbackCount = existingTicket.fallbackCount ?? 0;
        const updatedTicket = upsertTicket({
          cityId: cityId,
          conversationId,
          status: 'needs_human',
          needsHuman: true,
          category: categorization.category,
          fallbackCount,
        });
        setTicket(updatedTicket);
        
        // Send ticket_update event to backend
        if (config.apiBaseUrl) {
          const backendEvent: BackendEvent = {
            type: 'ticket_update',
            conversationId,
            needsHuman: true,
            ticket: {
              status: 'needs_human',
              department: updatedTicket.department,
              urgent: updatedTicket.urgent,
            },
            timestamp: Date.now(),
          };
          postBackendEvent({
            apiBaseUrl: config.apiBaseUrl,
            cityId: cityId,
            event: backendEvent,
          }).catch(() => {
            // Already handled in postBackendEvent
          });
        }
        return;
      }
      
      // If needsHuman is detected, proceed with ticket creation/update
      // Note: Intake form is now triggered via action events from backend, not here
      if (categorization.needsHuman) {
        const category = categorization.category;
        
        // Count fallbacks (messages that resulted in fallback error)
        // For now, we'll use 0 as fallbackCount since we don't track this explicitly
        const fallbackCount = existingTicket?.fallbackCount ?? 0;
        
        // If ticket exists and has contact (status is 'contact_requested'), preserve that status
        // Otherwise, set status to 'needs_human'
        const status = (existingTicket?.status === 'contact_requested') 
          ? undefined // Don't change status, let it stay 'contact_requested'
          : 'needs_human';
        
        const updatedTicket = upsertTicket({
          cityId: cityId,
          conversationId,
          ...(status && { status }), // Only include status if defined
          needsHuman: true,
          category,
          fallbackCount,
        });
        
        setTicket(updatedTicket);
        
        // Send ticket_update event to backend
        if (config.apiBaseUrl) {
          const backendEvent: BackendEvent = {
            type: 'ticket_update',
            conversationId,
            needsHuman: true,
            ticket: {
              status: status || 'needs_human',
              department: updatedTicket.department,
              urgent: updatedTicket.urgent,
            },
            timestamp: Date.now(),
          };
          postBackendEvent({
            apiBaseUrl: config.apiBaseUrl,
            cityId: cityId,
            event: backendEvent,
          }).catch(() => {
            // Already handled in postBackendEvent
          });
        }
      } else if (existingTicket) {
        // Ticket exists but needsHuman is false - just update updatedAt to refresh timestamp
        // This ensures updatedAt is refreshed for every user message
        const updatedTicket = upsertTicket({
          cityId: cityId,
          conversationId,
          // Don't change status or other fields, just trigger update for updatedAt refresh
        });
        setTicket(updatedTicket);
      }
    }
  }, [userMessages, conversationId, cityId]);

  // Show welcome message when panel opens for the first time
  useEffect(() => {
    if (isOpen && !hasShownWelcome) {
      setHasShownWelcome(true);
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: t(config.lang, 'welcome').replace(/\u2013/g, '-'),
        },
      ]);
    }
  }, [isOpen, hasShownWelcome, config.lang]);

  // Handle panel close - emit conversation_end and reset conversation for next open
  const handleClose = () => {
    if (activeForm === 'novorodeno_dijete' && typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(
          NOVORODENO_WIZARD_STORAGE_KEY,
          JSON.stringify({ step: novorodenoWizardStep, data: novorodenoWizardData })
        );
      } catch {
        // ignore
      }
    }
    if (activeForm === 'jednokratna_novcana_pomoc' && typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(
          JEDNOKRATNA_WIZARD_STORAGE_KEY,
          JSON.stringify({ step: jednokratnaWizardStep, data: jednokratnaWizardData })
        );
      } catch {
        // ignore
      }
    }
    if (conversationId) {
      emitConversationEnd(cityId, conversationId, 'user_closed');
      setConversationId(null);
      setTurnIndex(0);
    }
    setIsOpen(false);
  };

  /** Submit novorodeno form to POST /forms/submit; returns ref or error for wizard */
  const handleNovorodenoSubmit = async (
    data: NovorodenoDijeteFormData
  ): Promise<{ reference_number?: string; error?: string }> => {
    const apiBaseUrl = config.apiBaseUrl;
    if (!apiBaseUrl?.trim()) {
      return { error: t(config.lang, 'novorodenoSubmitError') };
    }
    const url = `${apiBaseUrl.replace(/\/$/, '')}/forms/submit`;
    const body = {
      ...buildNovorodenoSubmitPayload(cityId, data),
      ...(data.draftReferenceNumber && { reference_number: data.draftReferenceNumber }),
      ...(data.draftReferenceNumber && {
        attachments_enabled_categories: Object.keys(data.attachments?.enabledCategories ?? {}).filter(
          (k) => data.attachments?.enabledCategories?.[k]
        ),
      }),
    };
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => ({}))) as {
        reference_number?: string;
        error?: string;
      };
      if (response.ok && json.reference_number) {
        return { reference_number: json.reference_number };
      }
      return { error: json.error || t(config.lang, 'novorodenoSubmitError') };
    } catch {
      return { error: t(config.lang, 'novorodenoSubmitError') };
    }
  };

  /** On Odustani: exit form, clear wizard state, clear session storage */
  const handleNovorodenoOdustani = () => {
    setActiveForm(null);
    setNovorodenoWizardStep(1);
    setNovorodenoWizardData(getDefaultNovorodenoData());
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(NOVORODENO_WIZARD_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  /** On Odustani for jednokratna: exit form, clear wizard state, clear session storage */
  const handleJednokratnaOdustani = () => {
    setActiveForm(null);
    setJednokratnaWizardStep(1);
    setJednokratnaWizardData(getDefaultJednokratnaData());
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(JEDNOKRATNA_WIZARD_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  /** Submit jednokratna form to POST /forms/submit; returns ref or error for wizard */
  const handleJednokratnaSubmit = async (
    data: JednokratnaNovcanaPomocFormData
  ): Promise<{ reference_number?: string; error?: string }> => {
    const apiBaseUrl = config.apiBaseUrl;
    if (!apiBaseUrl?.trim()) {
      return { error: t(config.lang, 'jednokratnaSubmitError') };
    }
    const url = `${apiBaseUrl.replace(/\/$/, '')}/forms/submit`;
    const body = {
      ...buildJednokratnaSubmitPayload(cityId, data),
      ...(data.draftReferenceNumber && { reference_number: data.draftReferenceNumber }),
      ...(data.draftReferenceNumber && {
        attachments_enabled_categories: Object.keys(data.attachments?.enabledCategories ?? {}).filter(
          (k) => data.attachments?.enabledCategories?.[k]
        ),
      }),
    };
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => ({}))) as {
        reference_number?: string;
        error?: string;
      };
      if (response.ok && json.reference_number) {
        return { reference_number: json.reference_number };
      }
      return { error: json.error || t(config.lang, 'jednokratnaSubmitError') };
    } catch {
      return { error: t(config.lang, 'jednokratnaSubmitError') };
    }
  };

  /** On successful jednokratna submit: show message, exit form, clear wizard state */
  const handleJednokratnaSuccess = (referenceNumber: string) => {
    const content = t(config.lang, 'jednokratnaSuccessWithRef').replace('{ref}', referenceNumber);
    setMessages((prev) => [
      ...prev,
      { id: `jednokratna-success-${Date.now()}`, role: 'assistant', content },
    ]);
    setActiveForm(null);
    setJednokratnaWizardStep(1);
    setJednokratnaWizardData(getDefaultJednokratnaData());
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(JEDNOKRATNA_WIZARD_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  /** On successful submit: show message, exit form, clear wizard state */
  const handleNovorodenoSuccess = (referenceNumber: string) => {
    const content = t(config.lang, 'novorodenoSuccessWithRef').replace('{ref}', referenceNumber);
    setMessages((prev) => [
      ...prev,
      { id: `novorodeno-success-${Date.now()}`, role: 'assistant', content },
    ]);
    setActiveForm(null);
    setNovorodenoWizardStep(1);
    setNovorodenoWizardData(getDefaultNovorodenoData());
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(NOVORODENO_WIZARD_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
      }
    };
  }, []);

  const handleContactSubmit = async (contactData: ContactData) => {
    if (!conversationId) return;

    const updatedTicket = upsertTicket({
      cityId: cityId,
      conversationId,
      contact: {
        ...contactData,
        consentAt: Date.now(),
        ticketRef: undefined,
      },
    });

    let ticketRefFromServer: string | null = null;
    if (config.apiBaseUrl) {
      const backendEvent: BackendEvent = {
        type: 'contact_submit',
        conversationId,
        ticket: {
          status: 'contact_requested',
          contact: {
            name: contactData.name,
            phone: contactData.phone,
            email: contactData.email,
            location: contactData.location,
            note: contactData.note,
            consentAt: Date.now(),
          },
          department: updatedTicket.department,
          urgent: updatedTicket.urgent,
        },
        timestamp: Date.now(),
      };
      try {
        const url = `${config.apiBaseUrl}/grad/${cityId}/events`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backendEvent),
        });
        const data = (await response.json().catch(() => ({}))) as { ticket_ref?: string };
        ticketRefFromServer = data?.ticket_ref ?? null;
      } catch {
        // Use generic message below when no ref
      }
    }

    if (ticketRefFromServer) {
      setTicket(upsertTicket({
        cityId: cityId,
        conversationId,
        contact: {
          ...contactData,
          consentAt: Date.now(),
          ticketRef: ticketRefFromServer,
        },
      }));
    } else {
      setTicket(updatedTicket);
    }

    const confirmationContent = (ticketRefFromServer
      ? `${t(config.lang, 'contactConfirmationPrefix')} ${ticketRefFromServer}. ${t(config.lang, 'contactConfirmationSuffix')}`
      : t(config.lang, 'intakeConfirmation')).replace(/\u2013/g, '-');
    const confirmationMessage: Message = {
      id: `confirmation-${Date.now()}`,
      role: 'assistant',
      content: confirmationContent,
    };
    setMessages((prev) => [...prev, confirmationMessage]);
  };

  const handleIntakeSubmit = async (data: TicketIntakeData) => {
    if (!conversationId) return;
    
    // Hide form immediately (UX improvement)
    setShowIntakeForm(false);
    
    // Get consent text from i18n
    const consentText = t(config.lang, 'intakeConsent');
    const consentTimestamp = Date.now();
    
    // Send ticket_intake_submitted event to backend
    if (config.apiBaseUrl) {
      const backendEvent: BackendEvent = {
        type: 'ticket_intake_submitted',
        conversationId,
        timestamp: consentTimestamp,
        // Include intake data in event
        intake: {
          name: data.name,
          phone: data.phone,
          email: data.email,
          address: data.address,
          description: data.description,
          contact_note: data.contact_note,
          consent_given: data.consent_given,
          consent_text: consentText,
          consent_timestamp: consentTimestamp,
        },
      };
      
      try {
        // Make API call directly to check for 200 response
        const url = `${config.apiBaseUrl}/grad/${cityId}/events`;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
          abortController.abort();
        }, 2500);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(backendEvent),
          signal: abortController.signal,
        });
        
        clearTimeout(timeoutId);

        // Only mark as submitted if we get a 200 response
        if (response.ok) {
          setIntakeSubmitted(true);
          const data = (await response.json().catch(() => ({}))) as { ticket_ref?: string };
          const ticketRefFromServer = data?.ticket_ref ?? null;
          const confirmationContent = (ticketRefFromServer
            ? `${t(config.lang, 'contactConfirmationPrefix')} ${ticketRefFromServer}. ${t(config.lang, 'contactConfirmationSuffix')}`
            : t(config.lang, 'intakeConfirmation')).replace(/\u2013/g, '-');
          const confirmationMessage: Message = {
            id: `intake-confirmation-${Date.now()}`,
            role: 'assistant',
            content: confirmationContent,
          };
          setMessages((prev) => [...prev, confirmationMessage]);
        } else {
          // Reset form on error
          setShowIntakeForm(true);
          return;
        }
      } catch (error) {
        // Reset form on error
        setShowIntakeForm(true);
        return;
      }
    } else {
      // If no API, mark as submitted immediately (mock/dev mode)
      setIntakeSubmitted(true);
      const confirmationMessage: Message = {
        id: `intake-confirmation-${Date.now()}`,
        role: 'assistant',
        content: t(config.lang, 'intakeConfirmation').replace(/\u2013/g, '-'),
      };
      setMessages((prev) => [...prev, confirmationMessage]);
    }
  };

  const handleSend = async (text: string) => {
    // Deterministic frontend trigger: if message matches ticket intent, open form and return early (do not send to backend)
    if (matchesTicketIntent(text)) {
      
      // Ensure conversationId exists
      let currentConversationId = conversationId;
      if (!currentConversationId) {
        currentConversationId = createConversationId();
        setConversationId(currentConversationId);
        emitConversationStart(cityId, currentConversationId, config.apiBaseUrl);
      }
      
      // Add user message to chat (but don't send to backend)
      const userMessageId = `user-${Date.now()}`;
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, userMessage]);
      
      // Track user message for intake form initial description
      setUserMessages((prev) => [...prev, text]);
      
      // Emit message event for recording (even though we're not sending to backend)
      const currentTurnIndex = turnIndex;
      setTurnIndex(currentTurnIndex + 1);
      emitMessage(
        cityId,
        currentConversationId,
        'user',
        text,
        userMessageId,
        currentTurnIndex,
        config.apiBaseUrl
      );
      
      // Open intake form
      setIntakeSubmitted(false);
      setShowIntakeForm(true);
      return; // Do not send message to backend/LLM (form opens immediately)
    }
    
    // CRITICAL: Reset intake form state at the start of each message send
    // The form must ONLY be shown when backend explicitly requests it via response
    setShowIntakeForm(false);
    setIntakeSubmitted(false);
    // Reset metadata ref for new message
    metaRef.current = null;
    
    // Track start time for latency measurement
    const startTime = Date.now();

    // Ensure conversationId exists (should already exist from useEffect, but safety check)
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      currentConversationId = createConversationId();
      setConversationId(currentConversationId);
      emitConversationStart(cityId, currentConversationId, config.apiBaseUrl);
    }

    // Get current turn index and increment for next turn
    const currentTurnIndex = turnIndex;
    setTurnIndex(currentTurnIndex + 1);

    // Emit analytics event for question (emitted on every user send for compatibility)
    // Note: answerChars and latencyMs will be populated after completion or fallback
    emitEvent('question', cityId, text, { apiBaseUrl: config.apiBaseUrl });

    // Abort previous stream if running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }

    // Generate stable messageId for idempotent message insertion (reused on retries)
    const clientMessageId = crypto.randomUUID();
    
    // Add user message
    const userMessageId = `user-${Date.now()}`;
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    
    // Track user message for needsHuman computation
    setUserMessages((prev) => [...prev, text]);

    // Emit message event for user message
    emitMessage(
      cityId,
      currentConversationId,
      'user',
      text,
      userMessageId,
      currentTurnIndex,
      config.apiBaseUrl
    );

    // Production without apiBaseUrl: never use mock; show service unavailable
    if (apiUnavailableInProd) {
      if (typeof console !== 'undefined' && console.error) {
        console.error(
          '[GradWidget] apiBaseUrl is missing in production. Chat unavailable. Set data-api-base on the script tag.'
        );
      }
      const unavailContent = t(config.lang, 'serviceUnavailable').replace(/\u2013/g, '-');
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: unavailContent,
        },
      ]);
      return;
    }

    // Add assistant message with empty content
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // Initialize streaming state
    setIsStreaming(true);
    setHasReceivedFirstToken(false);
    hasReceivedFirstTokenRef.current = false;

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Set up timeout for fallback (6 seconds)
    streamTimeoutRef.current = setTimeout(() => {
      if (!hasReceivedFirstTokenRef.current) {
        // No tokens received within 6 seconds – SSE/request failed
        const errContent = t(config.lang, 'communicationError').replace(/\u2013/g, '-');
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: errContent,
                }
              : msg
          )
        );
        setIsStreaming(false);
        setHasReceivedFirstToken(false);
        
        // Emit analytics event for fallback (timeout - no tokens after timeout)
        const latencyMs = Date.now() - startTime;
        emitEvent('fallback', cityId, text, {
          answerChars: errContent.length,
          latencyMs,
          conversationId: currentConversationId,
          apiBaseUrl: config.apiBaseUrl,
        });

        // Emit message event for assistant fallback response
        emitMessage(
          cityId,
          currentConversationId,
          'assistant',
          errContent,
          assistantMessageId,
          currentTurnIndex + 1,
          config.apiBaseUrl,
          latencyMs
        );

        // Check if we need to escalate to human (2+ fallbacks in last 10 minutes)
        // Note: This only creates/updates tickets, does NOT show intake form
        // Intake form is ONLY shown when backend explicitly indicates via action or needs_human
        const fallbackCount = getRecentFallbackCount(
          cityId,
          currentConversationId,
          10 * 60 * 1000 // 10 minutes
        );
        
        if (fallbackCount >= 2) {
          const existingTicket = getTicket(cityId, currentConversationId);
          
          // If ticket exists and is closed, reopen it
          if (existingTicket && existingTicket.status === 'closed') {
            reopenTicket(cityId, currentConversationId);
            const reopenedTicket = getTicket(cityId, currentConversationId);
            setTicket(reopenedTicket);
            
            // Send ticket_update event to backend
            if (config.apiBaseUrl && reopenedTicket) {
              const backendEvent: BackendEvent = {
                type: 'ticket_update',
                conversationId: currentConversationId,
                needsHuman: true,
                ticket: {
                  status: 'needs_human',
                  ticketRef: reopenedTicket.contact?.ticketRef,
                  department: reopenedTicket.department,
                  urgent: reopenedTicket.urgent,
                },
                timestamp: Date.now(),
              };
              postBackendEvent({
                apiBaseUrl: config.apiBaseUrl,
                cityId: cityId,
                event: backendEvent,
              }).catch(() => {
                // Already handled in postBackendEvent
              });
            }
          }
          // Removed: Do NOT show intake form based on fallback count alone
          // Intake form must be explicitly requested by backend via action or needs_human
        }
      }
    }, 6000);

    try {
      // Stream tokens from transport
      let finalAnswerContent = '';
      for await (const token of transport.sendMessage({
        cityId: cityId,
        apiBaseUrl: config.apiBaseUrl,
        message: text,
        signal: abortController.signal,
        conversationId: conversationId || undefined,
        messageId: clientMessageId,
        onAction: (action) => {
          // Handle action events from backend
          // REMOVED: Do NOT show intake form based on action events
          // The backend is incorrectly sending ticket_intake_required for all messages
          // We will ONLY show form when needs_human === true in response metadata (after streaming completes)
          // This ensures form only appears when backend explicitly determines human is needed
        },
        onMeta: (metaObj) => {
          // Store metadata in ref immediately when meta event arrives
          metaRef.current = metaObj;
          
          // Attach metadata to the current assistant message
          setMessages(prev => 
            prev.map(m => 
              m.id === assistantMessageId 
                ? { ...m, metadata: metaObj }
                : m
            )
          );
        },
      })) {
        // Check if aborted – stop typing, show error, re-enable send
        if (abortController.signal.aborted) {
          if (streamTimeoutRef.current) {
            clearTimeout(streamTimeoutRef.current);
            streamTimeoutRef.current = null;
          }
          setIsStreaming(false);
          setHasReceivedFirstToken(false);
          const errContent = t(config.lang, 'communicationError').replace(/\u2013/g, '-');
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: errContent }
                : msg
            )
          );
          return;
        }

        // Clear timeout on first token
        if (!hasReceivedFirstTokenRef.current) {
          hasReceivedFirstTokenRef.current = true;
          if (streamTimeoutRef.current) {
            clearTimeout(streamTimeoutRef.current);
            streamTimeoutRef.current = null;
          }
          setHasReceivedFirstToken(true);
        }

        // Skip empty tokens, but preserve whitespace in non-empty tokens
        if (token === '') continue;

        // Normalize Unicode en-dash to hyphen for consistent rendering
        const normalizedToken = token.replace(/\u2013/g, '-');

        // Accumulate token in finalAnswerContent (do not update UI per token)
        finalAnswerContent += normalizedToken;
      }

      // Stream ended – check for abort (e.g. generator returned without throw)
      if (abortController.signal.aborted) {
        if (streamTimeoutRef.current) {
          clearTimeout(streamTimeoutRef.current);
          streamTimeoutRef.current = null;
        }
        setIsStreaming(false);
        setHasReceivedFirstToken(false);
        const errContent = t(config.lang, 'communicationError').replace(/\u2013/g, '-');
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: errContent }
              : msg
          )
        );
        return;
      }

      // Stream completed successfully
      setIsStreaming(false);
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }

      // Resolve metadata from multiple sources (single source of truth)
      const meta = resolveMeta(transport);

      // Handle case where backend sent [DONE] immediately with no content (fallback case)
      // If no content was streamed, show a fallback message so user gets a response
      if (finalAnswerContent.trim() === '') {
        finalAnswerContent = (t(config.lang, 'communicationError') || 'Izvinjavam se, trenutno ne mogu odgovoriti na ovo pitanje. Molimo pokušajte ponovno ili kontaktirajte nas direktno.').replace(/\u2013/g, '-');
      }

      // Set assistant message content once after streaming completes
      // (finalAnswerContent already has normalized content with – -> -)
      // Attach resolved metadata to message for stable access (single source of truth)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: finalAnswerContent, metadata: meta || msg.metadata }
            : msg
        )
      );

      // Check if backend explicitly indicates intake form should be shown
      // Use resolved meta (single source of truth) for deterministic access
      // Check BOTH needs_human (snake_case) and needsHuman (camelCase) from metadata (strict === true check)
      // If both are undefined/null/missing => treat as false (do not show form)
      const needsHuman = meta?.needs_human === true || meta?.needsHuman === true;
      
      if (needsHuman && !intakeSubmitted) {
        setShowIntakeForm(true);
      }

      // Emit message event for assistant response (ONE event at end of streaming)
      // Use finalAnswerContent which contains the complete response
      const latencyMs = Date.now() - startTime;
      emitMessage(
        cityId,
        currentConversationId,
        'assistant',
        finalAnswerContent,
        assistantMessageId,
        currentTurnIndex + 1,
        config.apiBaseUrl,
        latencyMs,
        meta
      );

      // Note: Question event was already emitted on send.
      // For successful completions, we don't emit a separate event.
      // The question event tracks that a question was asked.
      // If needed, metrics can be added to question events in a future update.
    } catch (error) {
      // Always stop typing and clear timeout on failure
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }
      setIsStreaming(false);
      setHasReceivedFirstToken(false);

      const errContent = t(config.lang, 'communicationError').replace(/\u2013/g, '-');
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: errContent }
            : msg
        )
      );

      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      // API error or stream issue – emit fallback events
      const latencyMs = Date.now() - startTime;
      emitEvent('fallback', cityId, text, {
        answerChars: errContent.length,
        latencyMs,
        conversationId: currentConversationId,
        apiBaseUrl: config.apiBaseUrl,
      });

      emitMessage(
        cityId,
        currentConversationId,
        'assistant',
        errContent,
        assistantMessageId,
        currentTurnIndex + 1,
        config.apiBaseUrl,
        latencyMs
      );

      // Check if we need to escalate to human (2+ fallbacks in last 10 minutes)
      // Note: This only creates/updates tickets, does NOT show intake form
      // Intake form is ONLY shown when backend explicitly indicates via action or needs_human
      const fallbackCount = getRecentFallbackCount(
        cityId,
        currentConversationId,
        10 * 60 * 1000 // 10 minutes
      );
      
      if (fallbackCount >= 2) {
        const existingTicket = getTicket(cityId, currentConversationId);
        
        // If ticket exists and is closed, reopen it
        if (existingTicket && existingTicket.status === 'closed') {
          reopenTicket(cityId, currentConversationId);
          const reopenedTicket = getTicket(cityId, currentConversationId);
          setTicket(reopenedTicket);
          
          // Send ticket_update event to backend
          if (config.apiBaseUrl && reopenedTicket) {
            const backendEvent: BackendEvent = {
              type: 'ticket_update',
              conversationId: currentConversationId,
              needsHuman: true,
              ticket: {
                status: 'needs_human',
                ticketRef: reopenedTicket.contact?.ticketRef,
                department: reopenedTicket.department,
                urgent: reopenedTicket.urgent,
              },
              timestamp: Date.now(),
            };
            postBackendEvent({
              apiBaseUrl: config.apiBaseUrl,
              cityId: cityId,
              event: backendEvent,
            }).catch(() => {
              // Already handled in postBackendEvent
            });
          }
        }
        // Removed: Do NOT show intake form based on fallback count alone
        // Intake form must be explicitly requested by backend via action or needs_human
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: 'auto',
        height: 'auto',
      }}
    >
      {isOpen && (
        <ChatPanel
          cityId={cityId}
          apiBaseUrl={config.apiBaseUrl}
          lang={config.lang}
          logoUrl={config.theme?.logoUrl}
          primaryColor={config.theme?.primary}
          secondaryColor={config.theme?.secondary}
          messages={messages}
          showTypingIndicator={isStreaming && !hasReceivedFirstToken}
          onClose={handleClose}
          onSend={handleSend}
          conversationId={conversationId}
          ticket={ticket}
          onContactSubmit={handleContactSubmit}
          showIntakeForm={showIntakeForm && !intakeSubmitted}
          onIntakeSubmit={handleIntakeSubmit}
          intakeInitialDescription={userMessages.length > 0 ? userMessages[userMessages.length - 1] : ''}
          onOpenIntakeForm={() => {
            setShowIntakeForm(true);
            setIntakeSubmitted(false);
          }}
          ctaDismissed={ctaDismissedSession}
          ctaDismissedJednokratna={ctaDismissedJednokratnaSession}
          activeForm={activeForm}
          onCtaDismiss={(formType) => {
            if (formType === 'novorodeno_dijete') setCtaDismissedSession(true);
            else if (formType === 'jednokratna_novcana_pomoc') setCtaDismissedJednokratnaSession(true);
          }}
          onCtaSubmit={(formType) => {
            setActiveForm(formType);
            if (formType === 'novorodeno_dijete') {
              setNovorodenoWizardStep(1);
              setNovorodenoWizardData(getDefaultNovorodenoData());
            }
          }}
          novorodenoWizardStep={novorodenoWizardStep}
          novorodenoWizardData={novorodenoWizardData}
          onNovorodenoWizardStepChange={setNovorodenoWizardStep}
          onNovorodenoWizardDataChange={setNovorodenoWizardData}
          onNovorodenoSubmit={handleNovorodenoSubmit}
          onNovorodenoSuccess={handleNovorodenoSuccess}
          onNovorodenoOdustani={handleNovorodenoOdustani}
          jednokratnaWizardStep={jednokratnaWizardStep}
          jednokratnaWizardData={jednokratnaWizardData}
          onJednokratnaWizardStepChange={setJednokratnaWizardStep}
          onJednokratnaWizardDataChange={setJednokratnaWizardData}
          onJednokratnaSubmit={handleJednokratnaSubmit}
          onJednokratnaSuccess={handleJednokratnaSuccess}
          onJednokratnaOdustani={handleJednokratnaOdustani}
        />
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
        }}
      >
        <BubbleButton
          onClick={() => setIsOpen(!isOpen)}
          isOpen={isOpen}
          primaryColor={config.theme?.primary}
        />
      </div>
    </div>
  );
};

export default WidgetApp;
