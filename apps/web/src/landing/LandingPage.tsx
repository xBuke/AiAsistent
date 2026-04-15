import { FormEvent, useEffect, useMemo, useState } from 'react';
import './LandingPage.css';

type DemoFormData = {
  ime: string;
  grad: string;
  uloga: string;
  email: string;
  poruka: string;
};

const roleOptions = ['Gradonačelnik/ica', 'Pročelnik IT odjela', 'Glasnogovornik', 'Ostalo'];

const demoQuestions = [
  '🕐 Koje je radno vrijeme gradske uprave?',
  '📄 Trebam jednokratnu novčanu pomoć',
  '🚧 Želim prijaviti komunalni problem',
];

export function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [copiedChip, setCopiedChip] = useState<string | null>(null);
  const [showPasteHint, setShowPasteHint] = useState(false);
  const [formData, setFormData] = useState<DemoFormData>({
    ime: '',
    grad: '',
    uloga: roleOptions[0],
    email: '',
    poruka: '',
  });

  const decorativeDocs = useMemo(
    () => [
      { active: true, name: 'Radno vrijeme gradske uprave', type: 'PDF' },
      { active: true, name: 'Komunalne usluge i prijave', type: 'DOC' },
      { active: false, name: 'Interni pravilnik 2026', type: 'PDF' },
      { active: true, name: 'Jednokratne pomoći građanima', type: 'TXT' },
      { active: false, name: 'Nacrt internog izvješća', type: 'XLS' },
    ],
    []
  );

  useEffect(() => {
    const animated = document.querySelectorAll<HTMLElement>('[data-animate]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );

    animated.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const body = document.body;
    if (modalOpen) {
      body.classList.add('lp-modal-open');
    } else {
      body.classList.remove('lp-modal-open');
    }
    return () => body.classList.remove('lp-modal-open');
  }, [modalOpen]);

  const handleDemoChipClick = async (text: string) => {
    const globalWidget =
      (window as any).CivisWidget || (window as any).civis || (window as any).GradWidget || (window as any).gradWidget;

    if (globalWidget) {
      const openMethod =
        typeof globalWidget.open === 'function'
          ? globalWidget.open.bind(globalWidget)
          : typeof globalWidget.show === 'function'
            ? globalWidget.show.bind(globalWidget)
            : null;
      const sendMethod =
        typeof globalWidget.sendMessage === 'function'
          ? globalWidget.sendMessage.bind(globalWidget)
          : typeof globalWidget.ask === 'function'
            ? globalWidget.ask.bind(globalWidget)
            : typeof globalWidget.send === 'function'
              ? globalWidget.send.bind(globalWidget)
              : null;

      if (openMethod) openMethod();
      if (sendMethod) {
        sendMethod(text);
        return;
      }
    }

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[src*="civis"], iframe[src*="widget"]');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'SEND_MESSAGE', text }, '*');
      globalWidget?.open?.();
      return;
    }

    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const host = document.querySelector<HTMLElement>('#grad-widget-host');
    const shadowRoot = host?.shadowRoot ?? null;

    if (shadowRoot) {
      const toggleButton =
        shadowRoot.querySelector<HTMLButtonElement>('button[aria-label*="Open chat"]') ||
        shadowRoot.querySelector<HTMLButtonElement>('button[aria-label*="chat"]');
      toggleButton?.click();

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const inputEl =
          shadowRoot.querySelector<HTMLInputElement>('textarea[placeholder*="Upišite"]') ||
          shadowRoot.querySelector<HTMLInputElement>('textarea[placeholder*="Type"]') ||
          shadowRoot.querySelector<HTMLInputElement>('input[placeholder*="Upišite"]') ||
          shadowRoot.querySelector<HTMLInputElement>('input[placeholder*="Type"]') ||
          shadowRoot.querySelector<HTMLInputElement>('textarea, input');

        if (inputEl) {
          const setter =
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(inputEl, text);
          } else {
            inputEl.value = text;
          }
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
          inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
          return;
        }

        await wait(120);
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedChip(text);
      setShowPasteHint(true);
      window.setTimeout(() => setCopiedChip((current) => (current === text ? null : current)), 1500);
    } catch {
      setShowPasteHint(true);
    }

    globalWidget?.open?.();
  };

  const openModal = () => {
    setModalOpen(true);
    setSubmitError('');
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          access_key: '423dd427-8443-4ed1-8395-6bba5d03b0a4',
          subject: 'Civis demo zahtjev',
          from_name: formData.ime,
          grad: formData.grad,
          uloga: formData.uloga,
          email: formData.email,
          poruka: formData.poruka,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error('Došlo je do pogreške. Pokušajte ponovno.');
      }

      setSubmitSuccess(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Došlo je do pogreške. Pokušajte ponovno.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderDemoButton = (className: string) => (
    <button type="button" className={className} onClick={openModal}>
      Zatraži demo →
    </button>
  );

  return (
    <div className="lp-page">
      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <button type="button" className="lp-wordmark" onClick={scrollToTop} aria-label="Povratak na vrh stranice">
            Civis
          </button>
          {renderDemoButton('lp-btn lp-btn-outline')}
        </div>
      </header>

      <main>
        <section className="lp-hero" id="hero">
          <div className="lp-orb lp-orb-1" />
          <div className="lp-orb lp-orb-2" />
          <div className="lp-orb lp-orb-3" />
          <div className="lp-container lp-hero-content">
            <div className="lp-pill">AI za javnu upravu · Hrvatska</div>
            <h1>
              Vaš grad. Dostupan <span>24/7</span>.
            </h1>
            <p>
              Civis odgovara na pitanja građana direktno s web stranice grada — iz vaših dokumenata, bez dodatnog
              osoblja.
            </p>
            <p className="lp-motivation">Postanite među prvima koji transformiraju svoju javnu upravu.</p>
            {renderDemoButton('lp-btn lp-btn-primary lp-hero-cta')}
            <a className="lp-scroll-link" href="#kako-radi">
              ↓ Kako radi
            </a>
          </div>
        </section>

        <section className="lp-section" id="kako-radi">
          <div className="lp-container">
            <h2 className="lp-title">Kako radi Civis</h2>
            <div className="lp-grid lp-grid-3">
              <article className="lp-card lp-step-card" data-animate>
                <div className="lp-card-icon">{'</>'}</div>
                <h3>Jedan script tag</h3>
                <p>Grad dobiva snippet koji se ugradi na stranicu. Nikakav razvoj nije potreban.</p>
              </article>
              <article className="lp-card lp-step-card" data-animate>
                <div className="lp-card-icon">💬</div>
                <h3>Građani postavljaju pitanja</h3>
                <p>Widget je dostupan 24/7. Odgovara iz dokumenata grada — točno i trenutno.</p>
              </article>
              <article className="lp-card lp-step-card" data-animate>
                <div className="lp-card-icon">📊</div>
                <h3>Grad ima uvid</h3>
                <p>Admin sučelje: razgovori, ticketi, forme, knowledge gaps i analitika.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-container">
            <h2 className="lp-title">Isprobajte sami</h2>
            <p className="lp-subtitle">Ovo je stvarni Civis widget. Kliknite pitanje ili upišite svoje.</p>
            <div className="lp-chip-row" data-animate>
              {demoQuestions.map((question) => (
                <button key={question} type="button" className="lp-chip" onClick={() => handleDemoChipClick(question)}>
                  {copiedChip === question ? 'Kopirano!' : question}
                </button>
              ))}
            </div>
            {showPasteHint ? <p className="lp-note">Kliknite pitanje, zatim ga zalijepite u chat →</p> : null}
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-container">
            <h2 className="lp-title">Što dobivate</h2>
            <div className="lp-grid lp-grid-3">
              <article className="lp-card lp-feature-tile" data-animate><h3>📥 Inbox</h3><p>Svaki zahtjev na jednom mjestu</p></article>
              <article className="lp-card lp-feature-tile" data-animate><h3>📂 Dokumenti</h3><p>Upload i upravljanje iz admin sučelja</p></article>
              <article className="lp-card lp-feature-tile" data-animate><h3>📊 Analitika</h3><p>Teme, trendovi, raspoloženje građana</p></article>
              <article className="lp-card lp-feature-tile" data-animate><h3>🔍 Knowledge gaps</h3><p>Što građani ne mogu pronaći</p></article>
              <article className="lp-card lp-feature-tile" data-animate><h3>📋 Forme</h3><p>Digitalni zahtjevi direktno u admin</p></article>
              <article className="lp-card lp-feature-tile" data-animate><h3>🔒 Sigurnost</h3><p>Origin validation, izolirani podaci po gradu</p></article>
            </div>
          </div>
        </section>

        <section className="lp-section lp-surface">
          <div className="lp-container">
            <h2 className="lp-title">Vi odlučujete što widget zna</h2>
            <p className="lp-subtitle lp-subtitle-wide">
              Civis ne koristi sve dokumente bez razlike. Grad ima potpunu kontrolu — vi birate koje informacije su
              dostupne građanima kroz widget.
            </p>
            <div className="lp-content-split">
              <div className="lp-feature-stack">
                <article className="lp-feature-row" data-animate>
                  <div className="lp-row-icon">🗂️</div>
                  <div><h3>Selektivni pristup dokumentima</h3><p>Uploadajte desete dokumenata, ali widgetu dajte pristup samo onima koje odaberete — npr. samo komunalne usluge i radno vrijeme, ne interni akti.</p></div>
                </article>
                <article className="lp-feature-row" data-animate>
                  <div className="lp-row-icon">⚡</div>
                  <div><h3>Ažuriranje u realnom vremenu</h3><p>Promijenite koji dokumenti su aktivni iz admin sučelja u bilo kojem trenutku. Widget odmah reflektira promjenu — bez tehničke intervencije.</p></div>
                </article>
                <article className="lp-feature-row" data-animate>
                  <div className="lp-row-icon">🔐</div>
                  <div><h3>Vaši podaci, vaša pravila</h3><p>Svaki grad ima potpuno izoliranu bazu. Nitko drugi nema pristup vašim dokumentima, upitima niti podacima građana.</p></div>
                </article>
              </div>
              <div className="lp-doc-mockup lp-card" data-animate>
                <h3>Aktivni dokumenti</h3>
                {decorativeDocs.map((doc) => (
                  <div key={doc.name} className="lp-doc-row">
                    <span className={`lp-toggle ${doc.active ? 'is-on' : ''}`} />
                    <span className="lp-doc-name">{doc.name}</span>
                    <span className="lp-doc-type">{doc.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-container">
            <h2 className="lp-title">Gdje god su vaši građani</h2>
            <p className="lp-subtitle">Civis nije samo web widget. Ista baza znanja, isti odgovori — na svim kanalima koje vaš grad koristi.</p>
            <div className="lp-grid lp-grid-4">
              <article className="lp-card lp-channel-card lp-channel-active" data-animate>
                <div className="lp-channel-top"><span className="lp-channel-icon">💬</span><span className="lp-badge lp-badge-green">Dostupno</span></div>
                <h3>Web widget</h3><p>Embed na službenu stranicu grada jednim script tagom.</p>
              </article>
              <article className="lp-card lp-channel-card lp-channel-soon" data-animate>
                <div className="lp-channel-top"><span className="lp-channel-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path fill="#22c55e" d="M16 3C8.82 3 3 8.68 3 15.7c0 2.47.74 4.87 2.14 6.95L3.72 29l6.53-1.37A13.19 13.19 0 0 0 16 29c7.18 0 13-5.68 13-12.7S23.18 3 16 3Zm.01 23.51a10.64 10.64 0 0 1-5.43-1.49l-.39-.23-3.87.81.82-3.78-.25-.39a10.42 10.42 0 0 1-1.62-5.57c0-5.82 4.82-10.55 10.75-10.55s10.75 4.73 10.75 10.55c0 5.83-4.82 10.65-10.76 10.65Zm5.9-7.85c-.32-.16-1.9-.94-2.2-1.04-.3-.1-.52-.16-.74.16-.22.31-.85 1.04-1.04 1.25-.2.21-.39.24-.72.08-.32-.16-1.37-.5-2.6-1.58-.96-.85-1.6-1.89-1.79-2.21-.19-.31-.02-.48.14-.64.14-.14.32-.37.48-.55.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.55-.08-.16-.74-1.78-1.01-2.43-.27-.65-.54-.56-.74-.57h-.63c-.21 0-.55.08-.84.4-.29.31-1.11 1.08-1.11 2.63s1.14 3.05 1.3 3.27c.16.21 2.25 3.52 5.45 4.93.76.33 1.36.53 1.83.67.77.24 1.47.21 2.02.13.62-.09 1.9-.78 2.17-1.53.27-.75.27-1.39.19-1.53-.08-.14-.29-.22-.61-.38Z"/></svg></span><span className="lp-badge lp-badge-amber">Uskoro</span></div>
                <h3>WhatsApp bot</h3><p>Službeni WhatsApp kanal grada. Isti odgovori, ista baza — na kanalu koji građani već koriste svaki dan.</p>
              </article>
              <article className="lp-card lp-channel-card lp-channel-soon" data-animate>
                <div className="lp-channel-top"><span className="lp-channel-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><defs><linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f59e0b"/><stop offset="50%" stopColor="#ec4899"/><stop offset="100%" stopColor="#8b5cf6"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#igGrad)"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="17.6" cy="6.4" r="1.1" fill="#fff"/></svg></span><span className="lp-badge lp-badge-amber">Uskoro</span></div>
                <h3>Instagram &amp; Messenger</h3><p>Automatski odgovori na DM poruke na službenim profilima grada na Instagramu i Facebook Messengeru.</p>
              </article>
              <article className="lp-card lp-channel-card lp-channel-soon" data-animate>
                <div className="lp-channel-top"><span className="lp-channel-icon">🔗</span><span className="lp-badge lp-badge-amber">Uskoro</span></div>
                <h3>Ostale integracije</h3><p>Viber, Telegram, e-mail bot i drugi kanali — na bazi zahtjeva gradova partnera.</p>
              </article>
            </div>
            <p className="lp-note">Sve nadogradnje su uključene u mjesečnu pretplatu — bez dodatnih troškova pri uvođenju novih kanala.</p>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-container">
            <h2 className="lp-title">Transparentne cijene</h2>
            <p className="lp-subtitle">Bez skrivenih naknada. Sve nadogradnje uključene.</p>
            <article className="lp-card lp-pricing-card" data-animate>
              <div className="lp-plan-tag">Standard plan</div>
              <div className="lp-price-wrap"><div className="lp-price">~1.500 €</div><div className="lp-price-note">/mjesec</div></div>
              <p className="lp-small-muted">Jednokratna implementacijska naknada pri uključivanju</p>
              <ul className="lp-checklist">
                <li>Neograničen broj upita građana</li><li>Admin sučelje za upravljanje</li><li>Sve nadogradnje na mjesečnoj bazi — bez dodatnih troškova</li><li>Novi kanali (WhatsApp, Instagram...) uključeni kada postanu dostupni</li><li>Onboarding i tehnička podrška</li><li>Sigurnosna izolacija podataka po gradu</li>
              </ul>
              <div className="lp-divider" />
              <div className="lp-eu-box"><div className="lp-eu-icon">🇪🇺</div><p>Suradnja s Civis može otvoriti prilike za financiranje kroz EU fondove za digitalizaciju javne uprave. Pomažemo pri identifikaciji relevantnih poziva i pripremi dokumentacije.</p></div>
              {renderDemoButton('lp-btn lp-btn-primary lp-pricing-cta')}
            </article>
          </div>
        </section>

        <section className="lp-section lp-cta-section" id="demo">
          <div className="lp-container">
            <h2 className="lp-title">Uvedite Civis u vaš grad</h2>
            <p className="lp-subtitle">Postanite među prvima. Ispunite obrazac — javit ćemo se u roku 5–7 radnih dana.</p>
            {renderDemoButton('lp-btn lp-btn-primary')}
          </div>
        </section>
      </main>

      <footer className="lp-footer">© 2026 Civis · Mangai</footer>

      {modalOpen && (
        <div className="lp-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="lp-demo-title" onClick={() => setModalOpen(false)}>
          <div className="lp-modal" onClick={(e) => e.stopPropagation()}>
            <button className="lp-modal-close" type="button" aria-label="Zatvori" onClick={() => setModalOpen(false)}>×</button>
            <h3 id="lp-demo-title">Zatraži demo</h3>
            {submitSuccess ? (
              <p className="lp-success-message">Hvala! Javit ćemo se u roku 5–7 radnih dana.</p>
            ) : (
              <form className="lp-form" onSubmit={handleSubmit}>
                <label>Ime i prezime<input required type="text" value={formData.ime} onChange={(e) => setFormData((prev) => ({ ...prev, ime: e.target.value }))} /></label>
                <label>Naziv grada / općine<input required type="text" value={formData.grad} onChange={(e) => setFormData((prev) => ({ ...prev, grad: e.target.value }))} /></label>
                <label>Vaša uloga<select value={formData.uloga} onChange={(e) => setFormData((prev) => ({ ...prev, uloga: e.target.value }))}>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                <label>Kontakt email<input required type="email" value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} /></label>
                <label>Poruka<textarea value={formData.poruka} placeholder="Što vas zanima? Imate li pitanja?" onChange={(e) => setFormData((prev) => ({ ...prev, poruka: e.target.value }))} /></label>
                {submitError ? <p className="lp-error-message">{submitError}</p> : null}
                <button className="lp-btn lp-btn-primary" type="submit" disabled={submitting}>{submitting ? 'Slanje...' : 'Pošalji zahtjev'}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
