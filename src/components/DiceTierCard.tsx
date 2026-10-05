import { useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { useGoldStatus } from '@/lib/gold-dice';
import { nextTier, SKIN_RANK, type DiceSkin } from '@/lib/dice-skin';
import { fireWinConfetti } from '@/lib/confetti';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const SEEN_TIER_KEY = 'mrb_dice_tier_seen_v1';

const TIER_LABEL: Record<Exclude<DiceSkin, 'white'>, TranslationKey> = {
  bronze: 'tierBronze', silver: 'tierSilver', gold: 'tierGold',
};

const SWATCH: Record<DiceSkin, string> = {
  white: 'bg-foreground/90 border-border',
  bronze: 'bg-gradient-to-br from-[hsl(26_55%_62%)] to-[hsl(24_50%_38%)] border-[hsl(26_45%_50%)]',
  silver: 'bg-gradient-to-br from-[hsl(210_15%_92%)] to-[hsl(210_8%_62%)] border-[hsl(210_10%_75%)]',
  gold: 'bg-gradient-to-br from-game-gold-light via-primary to-game-gold-dark border-game-gold',
};

/** Home card: progress toward permanent bronze/silver/gold dice. */
export function DiceTierCard() {
  const { t } = useTranslation();
  const status = useGoldStatus();
  const next = nextTier(status.yatzyMatches);

  // Celebrate once when a new permanent tier is reached.
  useEffect(() => {
    if (status.tier === 'white') return;
    const seen = (localStorage.getItem(SEEN_TIER_KEY) ?? 'white') as DiceSkin;
    if (SKIN_RANK[status.tier] <= SKIN_RANK[seen]) return;
    localStorage.setItem(SEEN_TIER_KEY, status.tier);
    fireWinConfetti({ durationMs: 1800 });
    toast.success(t('diceTierUnlocked', { tier: t(TIER_LABEL[status.tier]) }), { duration: 5000 });
    trackEvent('dice_tier_unlocked', { tier: status.tier });
  }, [status.tier, t]);

  const shown: DiceSkin = next ? next.tier : 'gold';
  const pct = next ? Math.min(100, (status.yatzyMatches / next.goal) * 100) : 100;

  return (
    <div className="w-full rounded-2xl bg-secondary/60 border border-border px-3 py-2.5 flex items-center gap-3">
      <div className={cn('shrink-0 w-9 h-9 rounded-xl border', SWATCH[shown])} aria-hidden />
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-bold text-foreground truncate">{t('diceTierTitle')}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {next
            ? t('diceTierProgress', { n: status.yatzyMatches, goal: next.goal, tier: t(TIER_LABEL[next.tier]) })
            : t('diceTierMax', { n: status.yatzyMatches })}
        </p>
        <div className="mt-1.5 h-1 rounded-full bg-background/50 overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
