import type { NovorodenoDijeteData } from './templates/novorodenoDijete.js';
import { renderNovorodenoDijeteHtml } from './templates/novorodenoDijete.js';
import type { JednokratnaPomocData } from './templates/jednokratnaPomoc.js';
import { renderJednokratnaPomocHtml } from './templates/jednokratnaPomoc.js';
import { htmlToPdfBuffer } from '../pdf/htmlToPdf.js';

export type FormType = 'novorodeno_dijete' | 'jednokratna_novcana_pomoc';

export async function generateFormPdf(formType: FormType, data: unknown): Promise<Buffer> {
  let html: string;
  if (formType === 'novorodeno_dijete') {
    html = renderNovorodenoDijeteHtml(data as NovorodenoDijeteData);
  } else if (formType === 'jednokratna_novcana_pomoc') {
    html = renderJednokratnaPomocHtml(data as JednokratnaPomocData);
  } else {
    throw new Error('[FORMS] Unknown formType: ' + formType);
  }
  return htmlToPdfBuffer(html);
}
