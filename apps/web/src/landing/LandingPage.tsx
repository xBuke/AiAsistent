import './LandingPage.css';

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <div className="landing-wordmark">Civis</div>
          <a className="admin-btn-primary landing-demo-btn" href="#cta">
            Zatrazi demo →
          </a>
        </div>
      </header>

      <section id="hero" className="landing-hero">
        <div className="landing-container landing-hero__content">
          <div className="landing-hero__tag">AI za javnu upravu</div>
          <h1>Vas grad. Dostupan 24/7.</h1>
          <p>
            AI asistent koji odgovara na pitanja gradana — direktno s vase web stranice.
          </p>
          <div className="landing-hero__actions">
            <a className="admin-btn-primary landing-hero__primary" href="#cta">
              Zatrazi demo za vas grad
            </a>
            <a className="landing-hero__link" href="#how">
              Kako radi ↓
            </a>
          </div>
        </div>
      </section>

      <section id="how" className="landing-how">
        <div className="landing-container">
          <h2>Kako radi</h2>
          <div className="landing-how__grid">
            <article className="landing-how__card">
              <div className="landing-how__icon">⌘</div>
              <h3>1. Embed widget</h3>
              <p>Jedan script tag na stranicu grada.</p>
            </article>
            <article className="landing-how__card">
              <div className="landing-how__icon">💬</div>
              <h3>2. Gradani pitaju</h3>
              <p>Widget odgovara iz vasih dokumenata, 24/7.</p>
            </article>
            <article className="landing-how__card">
              <div className="landing-how__icon">▦</div>
              <h3>3. Grad upravlja</h3>
              <p>Admin sucelje za konverzacije, tickete i dokumente.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="proof" className="landing-proof">
        <div className="landing-container">
          <h2>Grad Ploce vec koristi Civis</h2>
          <p>
            Gradani Ploca mogu pitati o komunalnim uslugama, radnom vremenu i uslugama grada — direktno na web
            stranici, bez cekanja.
          </p>
          <div className="landing-proof__stats">
            <div>∞ dostupnost</div>
            <div>&lt; 3s odgovor</div>
            <div>0 telefonskih poziva za FAQ pitanja</div>
          </div>
        </div>
      </section>

      <section id="cta" className="landing-cta">
        <div className="landing-container">
          <h2>Spremi vas grad za digitalno doba</h2>
          <form className="landing-cta__form" onSubmit={(e) => e.preventDefault()}>
            <input className="admin-input" type="email" placeholder="Email adresa" />
            <button type="submit" className="admin-btn-primary">
              Zatrazi demo
            </button>
          </form>
          <p>Kontaktirat cemo vas u roku 24 sata.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">© 2026 Civis · Mangai d.o.o.</div>
      </footer>
    </div>
  );
}
