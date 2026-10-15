import { useState } from 'react';
import { Check, Lock, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { DICE_DESIGNS, designName, designSwatchBg, type DiceDesign, type DesignKind } from '@/lib/dice-designs';
import { buyDesign, selectDesign, useShop } from '@/lib/dice-shop';
import { trackEvent } from '@/lib/analytics';
import { getProfileCountry } from '@/lib/profile';
import { fireWinConfetti } from '@/lib/confetti';
import { cn } from '@/lib/utils';

const KINDS: DesignKind[] = ['flag', 'color', 'pattern', 'exclusive'];
const PIPS_5 = [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]];

function MiniDie({ d, size = 44 }: { d: DiceDesign; size?: number }) {
  const glow = d.id === 'legend' ? `0 0 ${size * 0.5}px #ffb300, 0 0 ${size * 0.2}px #ff3fa8` : d.kind === 'exclusive' ? `0 0 ${size * 0.35}px ${d.glow ?? d.body}` : '0 4px 8px rgba(0,0,0,0.35)';
  return (
    <div className="relative rounded-[22%]" style={{ width: size, height: size, background: designSwatchBg(d), boxShadow: `inset 0 -${size * 0.08}px ${size * 0.12}px rgba(0,0,0,0.25), ${glow}` }} aria-hidden>
      {PIPS_5.map(([x, y], i) => (
        <span key={i} className="absolute rounded-full" style={{ left: `${x}%`, top: `${y}%`, width: size * 0.17, height: size * 0.17, background: d.pip, transform: 'translate(-50%,-50%)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45)' }} />
      ))}
    </div>
  );
}

/** Shop part of the "Tärningsbutik" sheet: XP balance, designs, buy/use. */
export function DiceShop() {
  const { t, lang } = useTranslation();
  const shop = useShop();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myCountry = getProfileCountry()?.toUpperCase() ?? null;
  const left = Math.max(0, shop.dailyCap - shop.earnedToday);
  const priceOf = (d: DiceDesign) => shop.prices[d.id] ?? 0;
  const cheapestLocked = DICE_DESIGNS.filter((d) => !shop.owned.includes(d.id) && priceOf(d) > shop.xp)
    .sort((a, b) => priceOf(a) - priceOf(b))[0];
  const pickedDesign = DICE_DESIGNS.find((d) => d.id === picked) ?? null;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const buy = (d: DiceDesign) => run(async () => {
    const r = await buyDesign(d.id);
    if (r === 'ok') {
      fireWinConfetti({ durationMs: 1200 });
      toast.success(t('shopBought', { name: designName(d, lang) }));
      trackEvent('dice_design_bought', { id: d.id, price: priceOf(d) });
    } else toast.error(r === 'xp' ? t('shopNotEnough') : t('errGeneric'));
  });

  const use = (id: string | null) => run(async () => {
    if (!(await selectDesign(id))) toast.error(t('errGeneric'));
    else trackEvent('dice_design_selected', { id: id ?? 'normal' });
  });

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">{t('shopTitle')}</p>
        <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
          <Star className="w-3.5 h-3.5 fill-current" aria-hidden />{t('shopXp', { n: shop.xp })}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t('shopEarnHint', { cap: shop.dailyCap, left })}</p>
      {cheapestLocked && (
        <p className="mt-1 text-[11px] font-semibold text-foreground">{t('shopNext', { n: priceOf(cheapestLocked) - shop.xp })}</p>
      )}

      <button
        onClick={() => use(null)}
        disabled={busy}
        className={cn('mt-3 w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left',
          shop.selected === null ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40')}
      >
        <div className="w-8 h-8 rounded-lg bg-secondary border border-border" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{t('shopNormal')}</p>
          <p className="text-[11px] text-muted-foreground">{t('shopNormalHint')}</p>
        </div>
        {shop.selected === null && <Check className="w-4 h-4 text-primary" />}
      </button>

      {KINDS.map((kind) => (
        <div key={kind} className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(`shopKind_${kind}` as TranslationKey)}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DICE_DESIGNS.filter((d) => d.kind === kind).sort((a, b) => kind === 'flag' ? Number(b.flag === myCountry) - Number(a.flag === myCountry) || designName(a, lang).localeCompare(designName(b, lang), lang) : 0).map((d) => {
              const owned = shop.owned.includes(d.id);
              const inUse = shop.selected === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setPicked(picked === d.id ? null : d.id)}
                  className={cn('relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 active:scale-95 transition',
                    picked === d.id || inUse ? 'border-primary bg-primary/10' : owned ? 'border-primary/40 bg-secondary/40' : 'border-border bg-secondary/40')}
                >
                  <MiniDie d={d} size={52} />
                  <span className="text-[11px] font-semibold text-foreground truncate max-w-full">{designName(d, lang)}</span>
                  {d.flag && d.flag === myCountry && <span className="absolute top-1 right-1 rounded-full bg-primary px-1.5 text-[9px] font-bold text-primary-foreground">{t('shopYourCountry')}</span>}
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    {inUse ? <Check className="w-3 h-3 text-primary" /> : owned ? t('shopUse') : <><Lock className="w-2.5 h-2.5" />{priceOf(d) || '…'}</>}
                  </span>
                </button>
              );
            })}
          </div>
          {pickedDesign && pickedDesign.kind === kind && (() => {
            const d = pickedDesign;
            const owned = shop.owned.includes(d.id);
            const inUse = shop.selected === d.id;
            const price = priceOf(d);
            const canBuy = price > 0 && shop.xp >= price;
            return (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3">
                <MiniDie d={d} size={72} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{designName(d, lang)}</p>
                  {!owned && !canBuy && price > 0 && (
                    <p className="text-[11px] text-muted-foreground">{t('shopNeed', { n: price - shop.xp })}</p>
                  )}
                </div>
                {inUse ? (
                  <span className="text-xs font-semibold text-primary">{t('shopInUse')}</span>
                ) : owned ? (
                  <button disabled={busy} onClick={() => use(d.id)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">{t('shopUse')}</button>
                ) : (
                  <button disabled={busy || !canBuy} onClick={() => buy(d)}
                    className={cn('rounded-lg px-3 py-2 text-xs font-bold', canBuy ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground')}>
                    {t('shopBuy', { price })}
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}
