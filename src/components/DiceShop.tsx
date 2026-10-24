import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Lock, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { DICE_DESIGNS, designName, designSwatchBg, type DiceDesign, type DesignKind } from '@/lib/dice-designs';
import { buyDesign, selectDesign, selectCosmetic, useShop } from '@/lib/dice-shop';
import { useGoldStatus } from '@/lib/gold-dice';
import { SKIN_RANK, type DiceSkin } from '@/lib/dice-skin';
import { CELEBRATIONS, FRAMES, cosmeticName } from '@/lib/cosmetics';
import { YatzyCelebration } from '@/components/game/YatzyCelebration';
import { getProfileAvatar } from '@/lib/profile';
import { trackEvent } from '@/lib/analytics';
import { getProfileCountry } from '@/lib/profile';
import { fireWinConfetti } from '@/lib/confetti';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ShopPurchaseDialog } from '@/components/ShopPurchaseDialog';

const KINDS: DesignKind[] = ['season', 'personal', 'flag', 'color', 'pattern', 'exclusive'];
const PIPS_5 = [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]];

/** Earned tier colours shown under "Mina tärningar" so players can pick any unlocked tier. */
const TIER_DICE: DiceDesign[] = [
  { id: 'bronze', name: 'Brons', kind: 'color', body: '#e09a63', pip: '#4a2410', finish: 'metal' },
  { id: 'silver', name: 'Silver', kind: 'color', body: '#cdd3db', pip: '#3d444d', finish: 'metal' },
  { id: 'gold', name: 'Guld', kind: 'color', body: '#f5cc5e', pip: '#5a430e', finish: 'metal' },
  { id: 'platinum', name: 'Platina', kind: 'color', body: '#eef4fb', pip: '#3f5f86', finish: 'metal' },
];

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
export function DiceShop({ ownedOnly = false }: { ownedOnly?: boolean }) {
  const { t, lang } = useTranslation();
  const shop = useShop();
  const gold = useGoldStatus();
  const unlockedTiers = TIER_DICE.filter((d) => SKIN_RANK[d.id as DiceSkin] <= SKIN_RANK[gold.tier]);
  const tierName = (id: string) => t(`tier${id[0].toUpperCase()}${id.slice(1)}` as TranslationKey);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewCel, setPreviewCel] = useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<{ name: string; price: number } | null>(null);
  const avatar = getProfileAvatar();
  const now = Date.now();
  const expired = (id: string) => !!shop.until[id] && new Date(shop.until[id]).getTime() < now;
  const visible = (d: DiceDesign) => !(d.kind === 'season' && (!shop.until[d.id] || expired(d.id)) && !shop.owned.includes(d.id));
  const untilLabel = (id: string) => shop.until[id] ? new Date(shop.until[id]).toLocaleDateString(lang, { day: 'numeric', month: 'short' }) : '';
  const myCountry = getProfileCountry()?.toUpperCase() ?? null;
  const priceOf = (d: DiceDesign) => shop.prices[d.id] ?? 0;
  const pickedDesign = DICE_DESIGNS.find((d) => d.id === picked) ?? null;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const buyId = (id: string, name: string) => run(async () => {
    const r = await buyDesign(id);
    if (r === 'ok') {
      fireWinConfetti({ durationMs: 1200 });
      setPurchase({ name, price: shop.prices[id] ?? 0 });
      trackEvent('dice_design_bought', { id, price: shop.prices[id] ?? 0 });
    } else toast.error(r === 'xp' ? t('shopNotEnough') : t('errGeneric'));
  });

  const use = (id: string | null) => run(async () => {
    if (!(await selectDesign(id))) toast.error(t('errGeneric'));
    else trackEvent('dice_design_selected', { id: id ?? 'normal' });
  });

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">{t(ownedOnly ? 'shopKind_owned' : 'shopTitle')}</p>
        {!ownedOnly && <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
          <Star className="w-3.5 h-3.5 fill-current" aria-hidden />{t('shopWallet', { n: shop.xp })}
        </span>}
      </div>
      {!ownedOnly && <p className="mt-1 text-[11px] text-muted-foreground">{t('shopEarnHintNoCap')}</p>}

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

      {(unlockedTiers.length > 0 || DICE_DESIGNS.some((d) => shop.owned.includes(d.id))) && (
        <div className="mt-4">
          {!ownedOnly && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('shopKind_owned')}</p>}
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {unlockedTiers.map((d) => (
              <button key={d.id} disabled={busy} onClick={() => use(d.id)} aria-label={tierName(d.id)}
                className={cn('relative shrink-0 flex flex-col items-center gap-1 rounded-xl border p-2 w-[72px]', shop.selected === d.id ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40')}>
                <MiniDie d={d} size={40} />
                <span className="text-[10px] font-semibold text-foreground truncate max-w-full">{tierName(d.id)}</span>
                {shop.selected === d.id && <Check className="absolute top-1 right-1 w-3 h-3 text-primary" />}
              </button>
            ))}
            {DICE_DESIGNS.filter((d) => shop.owned.includes(d.id)).map((d) => (
              <button key={d.id} disabled={busy} onClick={() => use(d.id)} aria-label={designName(d, lang)}
                className={cn('relative shrink-0 flex flex-col items-center gap-1 rounded-xl border p-2 w-[72px]', shop.selected === d.id ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40')}>
                <MiniDie d={d} size={40} />
                <span className="text-[10px] font-semibold text-foreground truncate max-w-full">{designName(d, lang)}</span>
                {shop.selected === d.id && <Check className="absolute top-1 right-1 w-3 h-3 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {!ownedOnly && KINDS.filter((kind) => DICE_DESIGNS.some((d) => d.kind === kind && visible(d))).map((kind) => (
        <div key={kind} className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t(`shopKind_${kind}` as TranslationKey)}
            {kind === 'season' && shop.until['h_pumpkin'] && <span className="ml-1 normal-case text-primary">· {t('shopUntil', { date: untilLabel('h_pumpkin') })}</span>}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DICE_DESIGNS.filter((d) => d.kind === kind && visible(d)).sort((a, b) => kind === 'flag' ? Number(b.flag === myCountry) - Number(a.flag === myCountry) || designName(a, lang).localeCompare(designName(b, lang), lang) : 0).map((d) => {
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
                  <button disabled={busy || !canBuy} onClick={() => buyId(d.id, designName(d, lang))}
                    className={cn('rounded-lg px-3 py-2 text-xs font-bold', canBuy ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground')}>
                    {t('shopBuy', { price })}
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      ))}
      {([
        { slot: 'celebration' as const, title: t('shopKind_celebration'), hint: t('shopCelebrationHint'), items: CELEBRATIONS, selected: shop.selectedCelebration },
        { slot: 'frame' as const, title: t('shopKind_frame'), hint: t('shopFrameHint'), items: FRAMES, selected: shop.selectedFrame },
      ]).map((sec) => (
        <div key={sec.slot} className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sec.title}</p>
          <p className="text-[11px] text-muted-foreground">{sec.hint}</p>
          <div className="mt-2 flex flex-col gap-2">
            <button disabled={busy} onClick={() => run(async () => { if (!(await selectCosmetic(sec.slot, null))) toast.error(t('errGeneric')); })}
              className={cn('flex items-center gap-3 rounded-xl border px-3 py-2 text-left', sec.selected === null ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40')}>
              <span className="flex-1 text-sm font-semibold text-foreground">{t('shopStandard')}</span>
              {sec.selected === null && <Check className="w-4 h-4 text-primary" />}
            </button>
            {sec.items.filter((it) => !ownedOnly || shop.owned.includes(it.id)).map((it) => {
              const owned = shop.owned.includes(it.id);
              const inUse = sec.selected === it.id;
              const price = shop.prices[it.id] ?? 0;
              const canBuy = price > 0 && shop.xp >= price;
              const frame = 'ring' in it ? it : null;
              const cel = 'emoji' in it ? it : null;
              return (
                <div key={it.id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2', inUse ? 'border-primary bg-primary/10' : 'border-border bg-secondary/40')}>
                  {frame ? (
                    <Button variant="ghost" size="icon" onClick={() => setPreviewFrame(previewFrame === it.id ? null : it.id)} aria-label={`${t('shopPreview')} ${cosmeticName(it, lang)}`} className="relative isolate shrink-0 rounded-full p-0">
                      <span className="pointer-events-none absolute rounded-full" style={{ inset: -3, background: frame.ring, boxShadow: `0 0 8px ${frame.glow}` }} aria-hidden />
                      <div className="relative w-9 h-9 rounded-full overflow-hidden bg-secondary flex items-center justify-center">
                        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-base">🙂</span>}
                      </div>
                    </Button>
                  ) : (
                    <Button variant="secondary" size="icon" onClick={() => setPreviewCel(it.id)} className="shrink-0 rounded-full text-xl" aria-label={`${t('shopPreview')} ${cosmeticName(it, lang)}`}>{cel?.emoji[0]}</Button>
                  )}
                  <div className="flex-1 min-w-0">
                    <Button variant="ghost" onClick={() => frame ? setPreviewFrame(previewFrame === it.id ? null : it.id) : setPreviewCel(it.id)} className="h-auto w-full min-w-0 flex-col items-start gap-0 whitespace-normal p-0 text-left hover:bg-transparent">
                      <span className="text-sm font-semibold text-foreground">{cosmeticName(it, lang)}</span>
                      <span className="min-h-6 flex items-center text-[11px] font-semibold text-primary">{t('shopPreview')}</span>
                    </Button>
                    {frame && previewFrame === it.id && (
                      <div className="py-4 flex justify-center">
                        <div className="relative isolate w-16 h-16 shrink-0">
                          <span className="pointer-events-none absolute rounded-full" style={{ inset: -4, background: frame.ring, boxShadow: `0 0 8px ${frame.glow}` }} aria-hidden />
                          <div className="relative w-16 h-16 rounded-full overflow-hidden bg-secondary flex items-center justify-center">
                            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl">🙂</span>}
                          </div>
                        </div>
                      </div>
                    )}
                    {!owned && !canBuy && price > 0 && <p className="text-[11px] text-muted-foreground">{t('shopNeed', { n: price - shop.xp })}</p>}
                  </div>
                  {inUse ? <Check className="w-4 h-4 text-primary" /> : owned ? (
                    <button disabled={busy} onClick={() => run(async () => { if (!(await selectCosmetic(sec.slot, it.id))) toast.error(t('errGeneric')); })}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">{t('shopUse')}</button>
                  ) : (
                    <button disabled={busy || !canBuy} onClick={() => buyId(it.id, cosmeticName(it, lang))}
                      className={cn('rounded-lg px-3 py-2 text-xs font-bold', canBuy ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground')}>
                      {price ? t('shopBuy', { price }) : '…'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {createPortal(<YatzyCelebration key={previewCel ?? 'none'} show={previewCel !== null} celebrationId={previewCel} onComplete={() => setPreviewCel(null)} />, document.body)}
      <ShopPurchaseDialog purchase={purchase} xp={shop.xp} onClose={() => setPurchase(null)} />
    </div>
  );
}
