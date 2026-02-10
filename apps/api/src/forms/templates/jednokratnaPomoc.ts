export type JednokratnaPomocData = {
  podnositelj: {
    ime_prezime: string;
    adresa: string;
    kontakt: string;
    oib: string;
    iban: string;
  };
  razlog_zamolbe: string; // multiline, preserve line breaks
  status_podnositelja: 'zaposlen' | 'umirovljenik' | 'nezaposlen';
  flags: {
    je_podstanar: boolean;
    zdravstveni_razlog: boolean;
  };
  meta: {
    mjesto_podnosenja: 'Ploče';
    datum_podnosenja: string; // "15. veljače 2026."
    ref_broj: string; // can be "REF-2026-001" in debug
  };
  attachments: {
    oi_ili_rodni_listovi: boolean;
    izjava_kucanstvo: boolean;
    dokaz_primanja: boolean;
    potvrda_poslodavca: boolean;
    odresci_mirovine: boolean;
    uvjerenje_hzz: boolean;
    potvrda_porezna: boolean;
    potvrda_hzss: boolean;
    ugovor_podstanarstvo: boolean;
    lijecnicka_dokumentacija: boolean;
    iban_potvrda: boolean;
  };
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeDate(s: string): string {
  return s.replace(/\.+$/, '.');
}

function checkbox(checked: boolean): string {
  return checked ? '☑' : '☐';
}

export function renderJednokratnaPomocHtml(data: JednokratnaPomocData): string {
  const { podnositelj, razlog_zamolbe, status_podnositelja, flags, meta, attachments } = data;
  const razlogHtml = esc(razlog_zamolbe).replace(/\n/g, '<br>');
  const datumPodnosenja = normalizeDate(meta.datum_podnosenja);

  const checklistItems: string[] = [
    `Osobna iskaznica / rodni listovi djece (${checkbox(attachments.oi_ili_rodni_listovi)})`,
    `Izjava o članovima kućanstva (${checkbox(attachments.izjava_kucanstvo)})`,
    `Dokaz o primanjima (${checkbox(attachments.dokaz_primanja)})`,
    `Potvrda Porezne uprave o dohotku (${checkbox(attachments.potvrda_porezna)})`,
    `Potvrda banke o IBAN-u (${checkbox(attachments.iban_potvrda)})`,
  ];
  if (status_podnositelja === 'zaposlen') {
    checklistItems.push(`Potvrda poslodavca (${checkbox(attachments.potvrda_poslodavca)})`);
  }
  if (status_podnositelja === 'umirovljenik') {
    checklistItems.push(`Odresci mirovine (${checkbox(attachments.odresci_mirovine)})`);
  }
  if (status_podnositelja === 'nezaposlen') {
    checklistItems.push(`Uvjerenje Zavoda za zapošljavanje (${checkbox(attachments.uvjerenje_hzz)})`);
  }
  if (flags.je_podstanar) {
    checklistItems.push(`Ugovor o podstanarstvu (${checkbox(attachments.ugovor_podstanarstvo)})`);
  }
  if (flags.zdravstveni_razlog) {
    checklistItems.push(`Liječnička dokumentacija (${checkbox(attachments.lijecnicka_dokumentacija)})`);
  }
  checklistItems.push(`Potvrda Hrvatskog zavoda za socijalnu skrb (${checkbox(attachments.potvrda_hzss)})`);

  const checklistHtml = checklistItems.map((item) => `<li>${item}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Noto Sans', sans-serif; font-size: 11pt; line-height: 1.4; color: #222; max-width: 100%; }
    .header { text-align: center; margin-bottom: 1.5em; }
    .header h1 { font-size: 14pt; margin: 0 0 0.2em 0; }
    .header .address { font-size: 10pt; color: #444; }
    .subject { font-weight: bold; margin-bottom: 1em; }
    .section { margin-bottom: 1em; }
    .label { font-weight: bold; margin-right: 0.3em; }
    .row { margin-bottom: 0.4em; }
    .razlog { margin: 0.5em 0; white-space: pre-wrap; }
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

  <p class="subject">Predmet: Zamolba za jednokratnu novčanu pomoć</p>

  <div class="section">
    <div class="row"><span class="label">Podnositelj:</span>${esc(podnositelj.ime_prezime)}</div>
    <div class="row"><span class="label">Adresa:</span>${esc(podnositelj.adresa)}</div>
    <div class="row"><span class="label">Kontakt:</span>${esc(podnositelj.kontakt)}</div>
    <div class="row"><span class="label">OIB:</span>${esc(podnositelj.oib)}</div>
    <div class="row"><span class="label">IBAN:</span>${esc(podnositelj.iban)}</div>
    ${meta.ref_broj ? `<div class="row"><span class="label">Ref. broj:</span>${esc(meta.ref_broj)}</div>` : ''}
  </div>

  <div class="section">
    <div class="row"><span class="label">Razlog podnošenja zamolbe:</span></div>
    <div class="razlog">${razlogHtml}</div>
  </div>

  <div class="section">
    <div class="row"><span class="label">Priložena dokumentacija (prema potrebi):</span></div>
    <ul>${checklistHtml}</ul>
  </div>

  <div class="date-line">U Pločama, ${esc(datumPodnosenja)}</div>

  <div class="footer">Zahtjev je podnesen elektroničkim putem sustava Civis – AI asistent Grada Ploča.
Podnositelj zahtjeva potvrdio je točnost unesenih podataka elektroničkom izjavom. Grad Ploče zadržava pravo zatražiti vlastoručni potpis ili originalnu dokumentaciju u daljnjem postupku obrade zahtjeva.</div>
</body>
</html>`;
}
