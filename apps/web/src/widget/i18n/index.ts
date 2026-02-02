import { strings as hrStrings } from './strings.hr';
import { strings as enStrings } from './strings.en';

export type Language = 'hr' | 'en';

export type StringKey = keyof typeof hrStrings;

const translations: Record<Language, typeof hrStrings> = {
  hr: hrStrings,
  en: enStrings,
};

export function t(lang: Language | string | undefined, key: StringKey): string {
  const normalizedLang = normalizeLanguage(lang);
  return translations[normalizedLang][key];
}

function normalizeLanguage(lang: Language | string | undefined): Language {
  if (lang === 'hr' || lang === 'en') {
    return lang;
  }
  return 'hr'; // Default to Croatian
}
