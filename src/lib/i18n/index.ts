import { useEffect, useState } from 'react';
import { getLanguage, useProfileSubscription, type Language } from '@/lib/profile';
import { sv, type TranslationKey } from './translations/sv';
import { en } from './translations/en';
import { no } from './translations/no';
import { da } from './translations/da';
import { fi } from './translations/fi';

const DICTS: Record<Language, typeof sv> = { sv, en, no, da, fi };

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
    return useProfileSubscription(() => {
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
