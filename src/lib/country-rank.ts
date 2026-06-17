import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from './session';
import { getLanguage, type Language } from './profile';

const COUNTRY_KEY = 'yatzy_country_code';

// Fallback when geo lookup fails — use UI language as a rough proxy.
const LANG_TO_COUNTRY: Record<Language, string> = {
  sv: 'SE',
  fi: 'FI',
  no: 'NO',
  da: 'DK',
  en: 'GB',
  es: 'ES',
  fr: 'FR',
  it: 'IT',
  de: 'DE',
};

const COUNTRY_NAMES: Record<string, { sv: string; en: string }> = {
  SE: { sv: 'Sverige', en: 'Sweden' },
  FI: { sv: 'Finland', en: 'Finland' },
  NO: { sv: 'Norge', en: 'Norway' },
  DK: { sv: 'Danmark', en: 'Denmark' },
  GB: { sv: 'Storbritannien', en: 'United Kingdom' },
  US: { sv: 'USA', en: 'United States' },
  DE: { sv: 'Tyskland', en: 'Germany' },
  FR: { sv: 'Frankrike', en: 'France' },
  IT: { sv: 'Italien', en: 'Italy' },
  ES: { sv: 'Spanien', en: 'Spain' },
  NL: { sv: 'Nederländerna', en: 'Netherlands' },
  PL: { sv: 'Polen', en: 'Poland' },
};

export function countryToFlag(code: string): string {
  if (!code || code.length !== 2) return '🏳️';
  const A = 0x1f1e6;
  const cc = code.toUpperCase();
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

export function countryName(code: string, lang: Language): string {
  const entry = COUNTRY_NAMES[code];
  if (!entry) {
    try {
      const dn = new Intl.DisplayNames([lang], { type: 'region' });
      return dn.of(code) ?? code;
    } catch {
      return code;
    }
  }
  return lang === 'sv' || lang === 'no' || lang === 'da' || lang === 'fi' ? entry.sv : entry.en;
}

function fallbackCountry(): string {
  // Try navigator.language first ("sv-SE" → "SE")
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && /^[A-Z]{2}$/.test(region)) return region;
    }
  } catch {
    /* ignore */
  }
  return LANG_TO_COUNTRY[getLanguage()] ?? 'SE';
}

export async function detectCountry(): Promise<string> {
  const cached = localStorage.getItem(COUNTRY_KEY);
  if (cached && /^[A-Z]{2}$/.test(cached)) return cached;

  // Try a couple of free IP-geo endpoints with a short timeout.
  const endpoints = [
    { url: 'https://ipapi.co/country/', parse: (t: string) => t.trim().toUpperCase() },
    { url: 'https://get.geojs.io/v1/ip/country', parse: (t: string) => t.trim().toUpperCase() },
  ];
  for (const { url, parse } of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const code = parse(await res.text());
      if (/^[A-Z]{2}$/.test(code)) {
        localStorage.setItem(COUNTRY_KEY, code);
        return code;
      }
    } catch {
      /* try next */
    }
  }
  const fb = fallbackCountry();
  localStorage.setItem(COUNTRY_KEY, fb);
  return fb;
}

export interface CountryRank {
  country: string;
  rank: number;
  total: number;
  games_played: number;
}

export async function syncCountryRank(gamesPlayed: number): Promise<CountryRank | null> {
  try {
    const country = await detectCountry();
    const sessionId = getSessionId();
    const { error: upErr } = await supabase.rpc('upsert_player_country_stats', {
      p_session_id: sessionId,
      p_country: country,
      p_games_played: gamesPlayed,
    });
    if (upErr) {
      console.warn('[country-rank] upsert failed', upErr);
      return null;
    }
    const { data, error } = await supabase.rpc('get_country_rank', { p_session_id: sessionId });
    if (error || !data) {
      console.warn('[country-rank] fetch failed', error);
      return null;
    }
    const d = data as { found: boolean; country: string; rank: number; total: number; games_played: number };
    if (!d.found) return null;
    return { country: d.country, rank: d.rank, total: d.total, games_played: d.games_played };
  } catch (e) {
    console.warn('[country-rank] sync error', e);
    return null;
  }
}
