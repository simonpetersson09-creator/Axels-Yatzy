// Gold dice reward: invite 3 friends (who finish their first friend match with
// you) → gold dice for 30 days. The server owns the rules; this only reads.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';

export interface GoldStatus {
  goldUntil: string | null;
  friends: number;
  /** Friends counted toward the next reward (0–2). */
  progress: number;
}

const CACHE_KEY = 'mrb_gold_status_v1';
const SEEN_KEY = 'mrb_gold_seen_until_v1';
const EMPTY: GoldStatus = { goldUntil: null, friends: 0, progress: 0 };

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

export function goldDaysLeft(s: GoldStatus): number {
  if (!isGoldActive(s)) return 0;
  return Math.max(1, Math.ceil((Date.parse(s.goldUntil!) - Date.now()) / 86_400_000));
}

export async function fetchGoldStatus(): Promise<GoldStatus> {
  try {
    const { data, error } = await supabase.rpc('get_gold_dice', { p_session_id: getSessionId() });
    if (error || !data) return readCache();
    const d = data as { gold_until?: string | null; friends?: number; progress?: number };
    const s: GoldStatus = {
      goldUntil: d.gold_until ?? null,
      friends: Number(d.friends ?? 0),
      progress: Number(d.progress ?? 0),
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

/** Player indexes in an online game that currently have gold dice. */
export function useGoldPlayerIndexes(gameId: string | null): Set<number> {
  const [set, setSet] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!gameId) return;
    let alive = true;
    (async () => {
      try {
        const { data: rows } = await supabase
          .from('game_players')
          .select('player_index, session_id, is_bot')
          .eq('game_id', gameId);
        const humans = (rows ?? []).filter((r) => !r.is_bot);
        if (!humans.length) return;
        const { data } = await supabase.rpc('get_gold_players', {
          p_session_ids: humans.map((r) => r.session_id),
        });
        const gold = new Set((data as string[] | null) ?? []);
        if (alive) setSet(new Set(humans.filter((r) => gold.has(r.session_id)).map((r) => r.player_index)));
      } catch { /* gold is cosmetic; ignore */ }
    })();
    return () => { alive = false; };
  }, [gameId]);
  return set;
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
