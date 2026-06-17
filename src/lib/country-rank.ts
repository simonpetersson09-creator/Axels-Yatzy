import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from './session';
import { getProfileCountry, type Language } from './profile';
import { getLocalStats } from './local-stats';

export function countryToFlag(code: string): string {
  if (!code || code.length !== 2) return '🏳️';
  const A = 0x1f1e6;
  const cc = code.toUpperCase();
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

export function countryName(code: string, lang: Language): string {
  try {
    const dn = new Intl.DisplayNames([lang], { type: 'region' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

export interface CountryRank {
  country: string;
  rank: number;
  total: number;
  games_played: number;
}

/**
 * Push the player's current games_played to the server and read back their
 * rank within their profile country. Returns null when the player has not
 * picked a country yet, or when the sync fails — callers should hide the UI.
 */
export async function syncCountryRank(gamesPlayed?: number): Promise<CountryRank | null> {
  const country = getProfileCountry();
  if (!country) return null;
  const games = gamesPlayed ?? getLocalStats().gamesPlayed;
  try {
    const sessionId = getSessionId();
    const { error: upErr } = await supabase.rpc('upsert_player_country_stats', {
      p_session_id: sessionId,
      p_country: country,
      p_games_played: games,
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
