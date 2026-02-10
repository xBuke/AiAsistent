/**
 * Minimal golden tests for PDF HTML template renderers.
 * Run: npm run test:pdf (no Chromium/puppeteer required)
 */
import { renderNovorodenoDijeteHtml } from '../src/forms/templates/novorodenoDijete.js';
import { renderJednokratnaPomocHtml } from '../src/forms/templates/jednokratnaPomoc.js';

// --- Sample data: Croatian diacritics, both conditional flags true where applicable ---

const novorodenoSample = {
  podnositelj: {
    ime_prezime: 'Šime Ćorić',
    adresa: 'Ulica kralja Zvonimira 5',
    kontakt: '+385 99 123 4567',
    oib: '12345678901',
    iban: 'HR1234567890123456789',
  },
  dijete: {
    godina_rodjenja: '2026',
    mjesto_rodjenja: 'Ploče',
    datum_rodjenja: '15.02.2026.',
  },
  flags: {
    roditelj_izvan_ploca: true,
    za_trece_ili_sljedece: true,
  },
  meta: {
    mjesto_podnosenja: 'Ploče' as const,
    datum_podnosenja: '15.02.2026.',
    ref_broj: 'REF-2026-001',
  },
};

const jednokratnaSample = {
  podnositelj: {
    ime_prezime: 'Ana Šimić',
    adresa: 'Trg bana Jelačića 1',
    kontakt: '+385 98 765 4321',
    oib: '98765432109',
    iban: 'HR9876543210987654321',
  },
  razlog_zamolbe: 'Prva linija razloga.\nDruga linija s novim redom.',
  status_podnositelja: 'zaposlen' as const,
  flags: {
    je_podstanar: false,
    zdravstveni_razlog: false,
  },
  meta: {
    mjesto_podnosenja: 'Ploče' as const,
    datum_podnosenja: '15. veljače 2026.',
    ref_broj: 'REF-2026-002',
  },
  attachments: {
    oi_ili_rodni_listovi: true,
    izjava_kucanstvo: false,
    dokaz_primanja: true,
    potvrda_poslodavca: false,
    odresci_mirovine: false,
    uvjerenje_hzz: false,
    potvrda_porezna: false,
    potvrda_hzss: false,
    ugovor_podstanarstvo: false,
    lijecnicka_dokumentacija: false,
    iban_potvrda: false,
  },
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertIncludes(html: string, substring: string, assertionName: string): void {
  assert(html.includes(substring), `[${assertionName}] Expected HTML to include "${substring}"`);
}

// --- Novorođeno template assertions ---
function testNovorodeno(): void {
  const html = renderNovorodenoDijeteHtml(novorodenoSample);

  assertIncludes(html, 'GRAD PLOČE', 'novorođeno: header');
  assertIncludes(html, 'Trg kralja Tomislava 23', 'novorođeno: address');
  assertIncludes(html, 'Šime Ćorić', 'novorođeno: diacritics');
  assertIncludes(html, 'Civis – AI asistent Grada Ploča', 'novorođeno: footer');
  assertIncludes(html, 'Potvrdu da nije ostvareno pravo', 'novorođeno: conditional roditelj_izvan_ploca');
  assertIncludes(html, 'Rodne listove ostale djece', 'novorođeno: conditional za_trece_ili_sljedece');
}

// --- Jednokratna template assertions ---
function testJednokratna(): void {
  const html = renderJednokratnaPomocHtml(jednokratnaSample);

  assertIncludes(html, 'Predmet: Zamolba za jednokratnu novčanu pomoć', 'jednokratna: subject');
  assertIncludes(html, 'Razlog podnošenja zamolbe:', 'jednokratna: reason label');
  assert(html.includes('<br'), `[jednokratna: multiline] Expected HTML to contain "<br" when reason has \\n`);
  assert(html.includes('☑') && html.includes('☐'), `[jednokratna: checkboxes] Expected at least one ☑ and one ☐`);
  assertIncludes(html, 'elektroničkim putem sustava Civis – AI asistent Grada Ploča', 'jednokratna: footer');
}

// --- Run ---
testNovorodeno();
testJednokratna();
console.log('OK: pdf template tests passed');
