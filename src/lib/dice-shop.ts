// Dice shop: XP from optional ads (server caps 10/day) buys shop designs.
// The server owns XP, prices and ownership; this only reads and asks.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, claimSession } from '@/lib/session';
import { getDeviceIdSync, initDeviceId } from '@/lib/device';
import { designLook, getDesign } from '@/lib/dice-designs';
import { effectiveSkin, useGoldStatus } from '@/lib/gold-dice';
import type { DiceLook } from '@/lib/dice-skin';

export interface ShopState {
  xp: number;
  earnedToday: number;
  dailyCap: number;
  selected: string | null;
  owned: string[];
  prices: Record<string, number>;
}

const CACHE_KEY = 'mrb_dice_shop_v1';
const EVENT = 'mrb-shop-changed';
const EMPTY: ShopState = { xp: 0, earnedToday: 0, dailyCap: 10, selected: null, owned: [], prices: {} };

function readCache(): ShopState {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch { /* noop */ }
  return EMPTY;
}

function writeCache(s: ShopState) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Patch cached state (e.g. white dice chosen clears the design). */
export function patchShopCache(p: Partial<ShopState>) {
  writeCache({ ...readCache(), ...p });
}

async function device(): Promise<string | null> {
  const d = await initDeviceId().catch(() => getDeviceIdSync());
  if (!d) return null;
  await claimSession();
  return d;
}

export async function fetchShop(): Promise<ShopState> {
  try {
    const { data, error } = await supabase.rpc('get_dice_shop', { p_session_id: getSessionId() });
    if (error || !data) return readCache();
    const d = data as { xp: number; earned_today: number; daily_cap: number; selected: string | null; owned: string[]; designs: { id: string; price: number }[] };
    const s: ShopState = {
      xp: Number(d.xp ?? 0), earnedToday: Number(d.earned_today ?? 0), dailyCap: Number(d.daily_cap ?? 10),
      selected: d.selected ?? null, owned: d.owned ?? [],
      prices: Object.fromEntries((d.designs ?? []).map((x) => [x.id, Number(x.price)])),
    };
    writeCache(s);
    return s;
  } catch {
    return readCache();
  }
}

export function useShop(): ShopState {
  const [s, setS] = useState<ShopState>(readCache);
  useEffect(() => {
    const on = () => setS(readCache());
    window.addEventListener(EVENT, on);
    void fetchShop();
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return s;
}

export type AwardResult = { ok: true; xp: number; earnedToday: number } | { ok: false; reason: string; xp?: number };

/** Call only after an optional ad was actually shown. */
export async function awardAdXp(): Promise<AwardResult> {
  try {
    const dev = await device();
    if (!dev) return { ok: false, reason: 'auth' };
    const { data, error } = await supabase.rpc('award_ad_xp', { p_session_id: getSessionId(), p_device_id: dev });
    if (error || !data) return { ok: false, reason: 'error' };
    const d = data as { ok: boolean; reason?: string; xp?: number; earned_today?: number };
    if (d.ok) {
      patchShopCache({ xp: Number(d.xp), earnedToday: Number(d.earned_today) });
      return { ok: true, xp: Number(d.xp), earnedToday: Number(d.earned_today) };
    }
    if (d.reason === 'cap') patchShopCache({ earnedToday: readCache().dailyCap });
    return { ok: false, reason: d.reason ?? 'error', xp: d.xp };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function buyDesign(id: string): Promise<'ok' | 'xp' | 'error'> {
  try {
    const dev = await device();
    if (!dev) return 'error';
    const { data, error } = await supabase.rpc('buy_dice_design', { p_session_id: getSessionId(), p_device_id: dev, p_design_id: id });
    const d = data as { ok: boolean; reason?: string } | null;
    if (error || !d) return 'error';
    if (!d.ok) return d.reason === 'xp' ? 'xp' : 'error';
    await fetchShop();
    return 'ok';
  } catch { return 'error'; }
}

/** null = back to the normal (tier) dice. */
export async function selectDesign(id: string | null): Promise<boolean> {
  try {
    const dev = await device();
    if (!dev) return false;
    const { data, error } = await supabase.rpc('select_dice_design', { p_session_id: getSessionId(), p_device_id: dev, p_design_id: id as string });
    if (error || data !== true) return false;
    patchShopCache({ selected: id });
    return true;
  } catch { return false; }
}

/** The look of my own dice: shop design if chosen, otherwise the tier colour. */
export function useMyDiceLook(): DiceLook {
  const gold = useGoldStatus();
  const shop = useShop();
  if (shop.selected && getDesign(shop.selected)) return designLook(shop.selected);
  return effectiveSkin(gold);
}
