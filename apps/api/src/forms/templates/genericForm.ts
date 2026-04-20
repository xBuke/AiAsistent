function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatGeneratedDate(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Format field values when `type === 'date'` (DD.MM.YYYY.). */
function formatDateFieldValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return '';
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(t);
    if (m) {
      const dd = pad2(Number(m[1]));
      const mm = pad2(Number(m[2]));
      return `${dd}.${mm}.${m[3]}`;
    }
    const isoDay = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (isoDay) {
      return `${pad2(Number(isoDay[3]))}.${pad2(Number(isoDay[2]))}.${isoDay[1]}`;
    }
    const parsed = new Date(t);
    if (!Number.isNaN(parsed.getTime())) {
      return `${pad2(parsed.getDate())}.${pad2(parsed.getMonth() + 1)}.${parsed.getFullYear()}`;
    }
    return esc(t);
  }
  return esc(String(value));
}

function formatDisplayValue(
  fieldType: string,
  value: unknown
): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' && value.trim() === '') return '';

  if (fieldType === 'date') {
    return formatDateFieldValue(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Da' : 'Ne';
  }

  if (Array.isArray(value)) {
    const parts = value.map((v) =>
      v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    );
    return esc(parts.filter(Boolean).join(', '));
  }

  if (typeof value === 'object') {
    return esc(JSON.stringify(value));
  }

  return esc(String(value));
}

export function renderGenericFormHtml(params: {
  formName: string;
  cityName: string;
  referenceNumber: string;
  fields: Array<{ id: string; label: string; type: string }>;
  requiredAttachments: Array<{ id: string; label: string; description: string; required: boolean }>;
  data: Record<string, unknown>;
}): string {
  const {
    formName,
    cityName,
    referenceNumber,
    fields,
    requiredAttachments,
    data,
  } = params;

  const generatedAt = formatGeneratedDate(new Date());

  const rows = fields
    .map((f) => {
      const raw = data[f.id];
      const display = formatDisplayValue(f.type, raw);
      const valueCell =
        display === ''
          ? '<span class="blank-line">&nbsp;</span>'
          : display;
      return `<tr>
  <td class="label-cell">${esc(f.label)}</td>
  <td class="value-cell">${valueCell}</td>
</tr>`;
    })
    .join('\n');

  const attachmentItems = requiredAttachments
    .map((a, i) => {
      const reqNote = a.required ? ' <span class="req-tag">(obvezno)</span>' : '';
      return `<li>
  <div class="att-label">${i + 1}. ${esc(a.label)}${reqNote}</div>
  <div class="att-desc">${esc(a.description)}</div>
</li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12mm 14mm;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #000;
      background: #fff;
      max-width: 210mm;
    }
    .header {
      text-align: center;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid #000;
    }
    .header .city { font-size: 12pt; font-weight: bold; margin: 0 0 4px 0; }
    .header .title { font-size: 13pt; font-weight: bold; margin: 0 0 8px 0; }
    .header .meta { font-size: 10pt; margin: 2px 0; }
    table.fields {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
    }
    table.fields td {
      border: 1px solid #000;
      padding: 8px 10px;
      vertical-align: top;
    }
    table.fields .label-cell {
      width: 38%;
      font-weight: bold;
      background: #f5f5f5;
    }
    table.fields .value-cell {
      width: 62%;
    }
    .blank-line {
      display: block;
      min-height: 1.2em;
      border-bottom: 1px solid #ccc;
    }
    .attachments {
      margin-top: 8px;
    }
    .attachments h2 {
      font-size: 11pt;
      margin: 0 0 8px 0;
      font-weight: bold;
    }
    .attachments ol {
      margin: 0;
      padding-left: 22px;
    }
    .attachments li { margin-bottom: 10px; }
    .att-label { font-weight: bold; }
    .att-desc { margin-top: 2px; font-weight: normal; }
    .req-tag { font-weight: normal; font-size: 9pt; }
  </style>
</head>
<body>
  <header class="header">
    <p class="city">${esc(cityName)}</p>
    <h1 class="title">${esc(formName)}</h1>
    <p class="meta">Referenca: ${esc(referenceNumber)}</p>
    <p class="meta">Datum izrade: ${esc(generatedAt)}</p>
  </header>
  <table class="fields" role="presentation">
    <tbody>
${rows}
    </tbody>
  </table>
  <section class="attachments">
    <h2>Prilozi</h2>
    <ol>
${attachmentItems}
    </ol>
  </section>
</body>
</html>`;
}
