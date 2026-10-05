import { useEffect, useState } from 'react';
import { getLanguage, subscribeProfileChanges, type Language } from '@/lib/profile';
import { sv, type TranslationKey } from './translations/sv';
import { en } from './translations/en';
import { no } from './translations/no';
import { da } from './translations/da';
import { fi } from './translations/fi';
import { es } from './translations/es';
import { fr } from './translations/fr';
import { it } from './translations/it';
import { de } from './translations/de';
import { nl } from './translations/nl';
import { ca } from './translations/ca';
import { ro } from './translations/ro';
import { tr } from './translations/tr';
import { pl } from './translations/pl';
import { cs } from './translations/cs';
import { sk } from './translations/sk';
import { sl } from './translations/sl';
import { hr } from './translations/hr';
import { hu } from './translations/hu';
import { pt } from './translations/pt';
import { ptBR } from './translations/ptBR';
import { id } from './translations/id';
import { ms } from './translations/ms';
import { vi } from './translations/vi';
import { el } from './translations/el';
import { ru } from './translations/ru';
import { uk } from './translations/uk';

const DICTS: Record<Language, typeof sv> = {
  sv, en, no, da, fi, es, fr, it, de,
  nl, ca, ro, tr, pl, cs, sk, sl, hr, hu, pt, 'pt-BR': ptBR, id, ms, vi, el, ru, uk,
};

export type { TranslationKey } from './translations/sv';

function format(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/**
 * Translate a key. Falls back to Swedish, then to the key itself.
 * Use outside React. Inside components prefer useTranslation() so they
 * re-render automatically when the language changes.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const lang = getLanguage();
  const raw = DICTS[lang]?.[key] ?? sv[key] ?? (key as string);
  return format(raw, params);
}

/**
 * React hook — returns a translator that re-renders the component on language change.
 */
export function useTranslation() {
  const [lang, setLang] = useState<Language>(() => getLanguage());

  useEffect(() => {
    return subscribeProfileChanges(() => {
      const next = getLanguage();
      setLang(prev => (prev === next ? prev : next));
    });
  }, []);

  const translate = (key: TranslationKey, params?: Record<string, string | number>) => {
    const raw = DICTS[lang]?.[key] ?? sv[key] ?? (key as string);
    return format(raw, params);
  };

  return { t: translate, lang };
}
