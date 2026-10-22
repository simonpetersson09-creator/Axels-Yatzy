// Start-up popup about optional ads + dice shop: every 5th app launch, at most 5 times.
const OPENS_KEY = 'mrb_shop_promo_opens_v1';
const SHOWN_KEY = 'mrb_shop_promo_shown_v1';
export const PROMO_EVERY = 5;
export const PROMO_MAX = 5;

const num = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const set = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };

let dueThisLaunch = false;

/** Call once per cold start. */
export function registerLaunch(): void {
  const opens = num(OPENS_KEY) + 1;
  set(OPENS_KEY, opens);
  dueThisLaunch = opens % PROMO_EVERY === 0 && num(SHOWN_KEY) < PROMO_MAX;
}

/** True once per due launch; records the showing. */
export function takeShopPromo(): boolean {
  if (!dueThisLaunch) return false;
  dueThisLaunch = false;
  set(SHOWN_KEY, num(SHOWN_KEY) + 1);
  return true;
}
