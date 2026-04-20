import type { NovorodenoDijeteData } from './templates/novorodenoDijete.js';
import { renderNovorodenoDijeteHtml } from './templates/novorodenoDijete.js';
import type { JednokratnaPomocData } from './templates/jednokratnaPomoc.js';
import { renderJednokratnaPomocHtml } from './templates/jednokratnaPomoc.js';
import { renderGenericFormHtml } from './templates/genericForm.js';
import { htmlToPdfBuffer } from '../pdf/htmlToPdf.js';

export type FormType = 'novorodeno_dijete' | 'jednokratna_novcana_pomoc';

export type GenerateFormPdfParams = {
  type: string;
  data: Record<string, unknown>;
  referenceNumber: string;
  formDefinition?: {
    name: string;
    fields: Array<{ id: string; label: string; type: string }>;
    requiredAttachments: Array<{ id: string; label: string; description: string; required: boolean }>;
  };
  cityName?: string;
};

function isParamsObject(arg: FormType | GenerateFormPdfParams): arg is GenerateFormPdfParams {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    'referenceNumber' in arg &&
    'data' in arg &&
    typeof (arg as GenerateFormPdfParams).referenceNumber === 'string' &&
    typeof (arg as GenerateFormPdfParams).data === 'object' &&
    (arg as GenerateFormPdfParams).data !== null &&
    !Array.isArray((arg as GenerateFormPdfParams).data)
  );
}

export async function generateFormPdf(formType: FormType, data: unknown): Promise<Buffer>;
export async function generateFormPdf(params: GenerateFormPdfParams): Promise<Buffer>;
export async function generateFormPdf(
  arg1: FormType | GenerateFormPdfParams,
  arg2?: unknown
): Promise<Buffer> {
  if (isParamsObject(arg1)) {
    const params = arg1;
    if (params.formDefinition) {
      const html = renderGenericFormHtml({
        formName: params.formDefinition.name,
        cityName: params.cityName ?? '',
        referenceNumber: params.referenceNumber,
        fields: params.formDefinition.fields,
        requiredAttachments: params.formDefinition.requiredAttachments,
        data: params.data,
      });
      return htmlToPdfBuffer(html);
    }

    const formType = params.type as FormType;
    let html: string;
    if (formType === 'novorodeno_dijete') {
      html = renderNovorodenoDijeteHtml(params.data as unknown as NovorodenoDijeteData);
    } else if (formType === 'jednokratna_novcana_pomoc') {
      html = renderJednokratnaPomocHtml(params.data as unknown as JednokratnaPomocData);
    } else {
      throw new Error('[FORMS] Unknown formType: ' + formType);
    }
    return htmlToPdfBuffer(html);
  }

  const formType = arg1 as FormType;
  const data = arg2;
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
