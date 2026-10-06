import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { useGoldStatus, ownProfile, goldDaysLeft } from '@/lib/gold-dice';
import { DiceInfoSheet } from '@/components/DiceInfoSheet';
import { nextTier, SKIN_RANK, type DiceSkin } from '@/lib/dice-skin';
import { fireWinConfetti } from '@/lib/confetti';
import { trackEvent } from '@/lib/analytics';
import goldDie from '@/assets/gold-die.png';

const SEEN_TIER_KEY = 'mrb_dice_tier_seen_v1';

const TIER_LABEL: Record<Exclude<DiceSkin, 'white'>, TranslationKey> = {
  bronze: 'tierBronze', silver: 'tierSilver', gold: 'tierGold',
};


/** Home card: progress toward permanent bronze/silver/gold dice. */
export function DiceTierCard() {
  const { t } = useTranslation();
  const status = useGoldStatus();
  const next = nextTier(status.yatzyMatches);
  const [open, setOpen] = useState(false);

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

  const pct = next ? Math.min(100, (status.yatzyMatches / next.goal) * 100) : 100;

  return (
    <>
    <button
      onClick={() => { setOpen(true); trackEvent('my_dice_opened', { from: 'home' }); }}
      aria-label={t('myDice')}
      className="w-full rounded-2xl bg-secondary/60 border border-border px-3 py-2.5 flex items-center gap-3 active:scale-[0.98] transition-transform"
    >
      <img src={goldDie} alt="" aria-hidden className="shrink-0 w-10 h-10 object-contain drop-shadow-[0_2px_4px_hsl(var(--background)/0.6)]" />
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
      <span className="shrink-0 text-[11px] font-semibold text-primary">{t('myDice')} ›</span>
    </button>
    <DiceInfoSheet
      open={open}
      onClose={() => setOpen(false)}
      name={t('myDice')}
      profile={ownProfile(status)}
      inviteDaysLeft={goldDaysLeft(status) || undefined}
      showLadder
    />
    </>
  );
}
