export type NovorodenoDijeteData = {
  podnositelj: {
    ime_prezime: string;
    adresa: string;
    kontakt: string;
    oib: string;
    iban: string;
  };
  dijete: {
    godina_rodjenja: string;
    mjesto_rodjenja: string;
    datum_rodjenja: string;
  };
  flags: {
    roditelj_izvan_ploca: boolean;
    za_trece_ili_sljedece: boolean;
  };
  meta: {
    mjesto_podnosenja: 'Ploče';
    datum_podnosenja: string;
    ref_broj: string;
  };
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ensure date string ends with a single period (e.g. "15.02.2026.." → "15.02.2026."). */
function normalizeDate(s: string): string {
  return s.replace(/\.+$/, '.');
}

export function renderNovorodenoDijeteHtml(data: NovorodenoDijeteData): string {
  const {
    podnositelj,
    dijete,
    flags,
    meta,
  } = data;

  const datumDjeteta = normalizeDate(dijete.datum_rodjenja);
  const mjestoRodjenjaDisplay = dijete.mjesto_rodjenja === 'Ploče' ? 'Pločama' : dijete.mjesto_rodjenja;
  const mainSentence = `Molim Vas da mi dodijelite novčanu pomoć za dijete rođeno u ${esc(dijete.godina_rodjenja)} godini, u ${esc(mjestoRodjenjaDisplay)}, dana ${esc(datumDjeteta)}`;

  const attachments: string[] = [
    'Rodni list djeteta',
    'Uvjerenje o prebivalištu djeteta',
    'Preslike osobnih iskaznica oba roditelja',
    'Potvrdu o IBAN-u',
  ];
  if (flags.roditelj_izvan_ploca) {
    attachments.push('Potvrdu da nije ostvareno pravo na pomoć u drugoj jedinici lokalne samouprave.');
  }
  if (flags.za_trece_ili_sljedece) {
    attachments.push('Rodne listove ostale djece.');
  }

  const attachmentItems = attachments
    .map((a) => `<li>${esc(a)}</li>`)
    .join('');

  const mjestoDisplay = meta.mjesto_podnosenja === 'Ploče' ? 'Pločama' : meta.mjesto_podnosenja;
  const datumPodnosenja = normalizeDate(meta.datum_podnosenja);

  return `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Noto Sans', sans-serif; font-size: 11pt; line-height: 1.4; color: #222; max-width: 100%; }
    .header { text-align: center; margin-bottom: 1.5em; }
    .header h1 { font-size: 14pt; margin: 0 0 0.2em 0; }
    .header .address { font-size: 10pt; color: #444; }
    .section { margin-bottom: 1em; }
    .label { font-weight: bold; margin-right: 0.3em; }
    .row { margin-bottom: 0.4em; }
    .main-sentence { margin: 1.2em 0; }
    ul { margin: 0.5em 0; padding-left: 1.4em; }
    .date-line { margin-top: 1.5em; }
    .footer { margin-top: 2em; font-size: 9pt; color: #555; white-space: pre-line; }
  </style>
</head>
<body>
  <div class="header">
    <h1>GRAD PLOČE</h1>
    <div class="address">Trg kralja Tomislava 23, Ploče</div>
  </div>

  <p class="main-sentence">${mainSentence}</p>

  <div class="section">
    <div class="row"><span class="label">Podnositelj:</span>${esc(podnositelj.ime_prezime)}</div>
    <div class="row"><span class="label">Adresa:</span>${esc(podnositelj.adresa)}</div>
    <div class="row"><span class="label">Kontakt:</span>${esc(podnositelj.kontakt)}</div>
    <div class="row"><span class="label">OIB:</span>${esc(podnositelj.oib)}</div>
    <div class="row"><span class="label">IBAN:</span>${esc(podnositelj.iban)}</div>
    ${meta.ref_broj ? `<div class="row"><span class="label">Ref. broj:</span>${esc(meta.ref_broj)}</div>` : ''}
  </div>

  <div class="section">
    <span class="label">Prilozi:</span>
    <ul>${attachmentItems}</ul>
  </div>

  <div class="date-line">U ${esc(mjestoDisplay)}, ${esc(datumPodnosenja)}</div>

  <div class="footer">Zahtjev je podnesen elektroničkim putem putem sustava Civis – AI asistent Grada Ploča.
Podnositelj zahtjeva potvrdio je točnost unesenih podataka elektroničkom izjavom.
Grad Ploče zadržava pravo zatražiti vlastoručni potpis ili originalnu dokumentaciju u daljnjem postupku obrade zahtjeva.</div>
</body>
</html>`;
}
