// Dice colours: each counted friend → +10 days temporary gold; permanent
// bronze/silver/gold from finished matches with a Yatzy (10/50/200). The server owns the rules; this only reads.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, claimSession } from '@/lib/session';
import { getDeviceIdSync, initDeviceId } from '@/lib/device';
import { asSkin, type DiceSkin } from '@/lib/dice-skin';

export interface GoldStatus {
  goldUntil: string | null;
  friends: number;
  /** Friends counted toward the next reward (0–2). */
  progress: number;
  /** Permanent tier earned from matches with a Yatzy. */
  tier: DiceSkin;
  yatzyMatches: number;
}

const CACHE_KEY = 'mrb_gold_status_v1';
const SEEN_KEY = 'mrb_gold_seen_until_v1';
const EMPTY: GoldStatus = { goldUntil: null, friends: 0, progress: 0, tier: 'white', yatzyMatches: 0 };

function readCache(): GoldStatus {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch { /* noop */ }
  return EMPTY;
}

export function isGoldActive(s: GoldStatus | null | undefined): boolean {
  return !!s?.goldUntil && Date.parse(s.goldUntil) > Date.now();
}

/** Dice colour to show: temporary gold wins, otherwise the permanent tier. */
export function effectiveSkin(s: GoldStatus): DiceSkin {
  return isGoldActive(s) ? 'gold' : s.tier;
}

/** Report a finished match vs the computer that had a Yatzy (server dedupes per match). */
export async function reportLocalYatzyMatch(matchKey: string): Promise<void> {
  try {
    // Device id and session ownership must be ready, or the server rejects the report.
    const device = await initDeviceId().catch(() => getDeviceIdSync());
    if (!device) return;
    await claimSession();
    await supabase.rpc('record_local_yatzy_match', {
      p_session_id: getSessionId(), p_device_id: device, p_match_key: `sp:${matchKey}`,
    });
    await fetchGoldStatus(); // refresh cache so Home shows new progress
  } catch { /* cosmetic; ignore */ }
}

export function goldDaysLeft(s: GoldStatus): number {
  if (!isGoldActive(s)) return 0;
  return Math.max(1, Math.ceil((Date.parse(s.goldUntil!) - Date.now()) / 86_400_000));
}

export async function fetchGoldStatus(): Promise<GoldStatus> {
  try {
    const { data, error } = await supabase.rpc('get_gold_dice', { p_session_id: getSessionId() });
    if (error || !data) return readCache();
    const d = data as { gold_until?: string | null; friends?: number; progress?: number; tier?: string; yatzy_matches?: number };
    const s: GoldStatus = {
      goldUntil: d.gold_until ?? null,
      friends: Number(d.friends ?? 0),
      progress: Number(d.progress ?? 0),
      tier: asSkin(d.tier),
      yatzyMatches: Number(d.yatzy_matches ?? 0),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    return s;
  } catch {
    return readCache();
  }
}

/** Own gold status: cached value immediately, refreshed from the server. */
export function useGoldStatus(): GoldStatus {
  const [s, setS] = useState<GoldStatus>(readCache);
  useEffect(() => {
    let alive = true;
    fetchGoldStatus().then((v) => {
      // Baseline for the "your friend counts" confirmation after a match.
      if (localStorage.getItem('mrb_gold_known_friends_v1') === null) {
        localStorage.setItem('mrb_gold_known_friends_v1', String(v.friends));
      }
      if (alive) setS(v);
    });
    return () => { alive = false; };
  }, []);
  return s;
}

/**
 * True once per newly earned gold period, so Home can celebrate it.
 * Marks the period as seen.
 */
export function consumeNewGold(s: GoldStatus): boolean {
  if (!isGoldActive(s)) return false;
  const seen = localStorage.getItem(SEEN_KEY);
  if (seen && Date.parse(seen) >= Date.parse(s.goldUntil!) - 60_000) return false;
  localStorage.setItem(SEEN_KEY, s.goldUntil!);
  return true;
}

export interface DiceProfile {
  isBot: boolean;
  tier: DiceSkin;
  yatzyMatches: number;
  /** Temporary gold from inviting friends is active. */
  inviteGold: boolean;
}

export function profileSkin(p: DiceProfile | undefined): DiceSkin {
  if (!p) return 'white';
  return p.inviteGold ? 'gold' : p.tier;
}

export function ownProfile(s: GoldStatus): DiceProfile {
  return { isBot: false, tier: s.tier, yatzyMatches: s.yatzyMatches, inviteGold: isGoldActive(s) };
}

/** Public dice info per player index in an online game. */
export function useDiceProfiles(gameId: string | null): Map<number, DiceProfile> {
  const [map, setMap] = useState<Map<number, DiceProfile>>(new Map());
  useEffect(() => {
    if (!gameId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_dice_profiles', { p_game_id: gameId });
        const rows = (data as Array<{ player_index: number; is_bot: boolean; tier: string; yatzy_matches: number; invite_gold: boolean }> | null) ?? [];
        if (alive) setMap(new Map(rows.map((r) => [r.player_index, {
          isBot: !!r.is_bot, tier: asSkin(r.tier), yatzyMatches: Number(r.yatzy_matches ?? 0), inviteGold: !!r.invite_gold,
        }])));
      } catch { /* cosmetic; ignore */ }
    })();
    return () => { alive = false; };
  }, [gameId]);
  return map;
}

const KNOWN_FRIENDS_KEY = 'mrb_gold_known_friends_v1';

/**
 * Re-reads gold status and returns it when a new friend has been counted
 * since last check (null otherwise). The first check only records a baseline.
 */
export async function checkNewFriendCredit(): Promise<GoldStatus | null> {
  const s = await fetchGoldStatus();
  const raw = localStorage.getItem(KNOWN_FRIENDS_KEY);
  localStorage.setItem(KNOWN_FRIENDS_KEY, String(s.friends));
  if (raw === null) return null;
  return s.friends > Number(raw) ? s : null;
}
