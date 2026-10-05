import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { useGoldStatus, isGoldActive, goldDaysLeft, consumeNewGold } from '@/lib/gold-dice';
import { fireWinConfetti } from '@/lib/confetti';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/utils';

/** Home card: "Invite 3 friends → gold dice for 30 days" with progress. */
export function GoldInviteCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useGoldStatus();
  const active = isGoldActive(status);
  const days = goldDaysLeft(status);

  useEffect(() => {
    if (!consumeNewGold(status)) return;
    const earned = status.friends > 0 && status.progress === 0;
    fireWinConfetti({ durationMs: 1800 });
    toast.success(t(earned ? 'goldEarned' : 'goldWelcome'), { duration: 5000 });
    trackEvent(earned ? 'gold_dice_earned' : 'gold_dice_welcome');
  }, [status, t]);

  const invite = () => {
    trackEvent('gold_card_invite');
    navigate('/multiplayer');
  };

  return (
    <div className="w-full rounded-2xl bg-secondary/60 border border-game-gold/30 px-3 py-2.5 flex items-center gap-3">
      <div className="flex gap-1 shrink-0" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'w-5 h-5 rounded-md border flex items-center justify-center text-[10px] font-bold',
              i < status.progress
                ? 'bg-gradient-to-br from-game-gold-light via-primary to-game-gold-dark border-game-gold text-primary-foreground'
                : 'bg-background/40 border-border text-muted-foreground/50',
            )}
          >
            {i < status.progress ? '✓' : i + 1}
          </span>
        ))}
      </div>

      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-display font-bold text-foreground leading-tight">
          {active ? t('goldActive', { days }) : t('goldCardTitle')}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {active && days <= 3
            ? t('goldEndingSoon')
            : `${t('goldCardProgress', { n: status.progress })} · ${t('goldCardHint')}`}
        </p>
      </div>

      <button
        onClick={invite}
        className="shrink-0 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-display font-bold active:scale-95 transition-transform"
      >
        {t('goldCardInvite')}
      </button>
    </div>
  );
}
