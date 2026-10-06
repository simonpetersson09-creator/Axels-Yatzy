import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
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
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!consumeNewGold(status)) return;
    const earned = status.friends > 0;
    fireWinConfetti({ durationMs: 1800 });
    toast.success(t(earned ? 'goldEarned' : 'goldWelcome'), { duration: 5000 });
    trackEvent(earned ? 'gold_dice_earned' : 'gold_dice_welcome');
  }, [status, t]);

  const invite = () => {
    trackEvent('gold_card_invite');
    navigate('/multiplayer', { state: { autoCreate: true } });
  };

  return (
    <div className="relative w-full rounded-2xl bg-secondary/60 border border-game-gold/30 px-3 py-2.5 flex items-center gap-3">
      <button
        onClick={() => { setShowInfo(true); trackEvent('gold_info_opened'); }}
        aria-label={t('goldInfoTitle')}
        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-secondary border border-game-gold/40 flex items-center justify-center text-game-gold active:scale-90 transition-transform"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      <div
        className={cn(
          'shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center font-display font-black text-sm',
          status.friends > 0
            ? 'bg-gradient-to-br from-game-gold-light via-primary to-game-gold-dark border-game-gold text-primary-foreground'
            : 'bg-background/40 border-border text-muted-foreground/60',
        )}
        aria-hidden
      >
        {status.friends}
      </div>

      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-display font-bold text-foreground leading-tight">
          {active ? t('goldActive', { days }) : t('goldCardTitle')}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {active && days <= 3
            ? t('goldEndingSoon')
            : `${t('goldCardProgress', { n: status.friends })} · ${t('goldCardHint')}`}
        </p>
      </div>

      <button
        onClick={invite}
        className="shrink-0 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-display font-bold active:scale-95 transition-transform"
      >
        {t('goldCardInvite')}
      </button>

      {showInfo && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-sm px-6"
          onClick={() => setShowInfo(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-3xl bg-card border border-game-gold/30 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInfo(false)}
              aria-label={t('close')}
              className="absolute top-3 right-3 p-1.5 rounded-full text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="font-display font-bold text-lg text-foreground pr-6">{t('goldInfoTitle')}</h2>
            <ol className="mt-3 flex flex-col gap-2.5 text-sm text-muted-foreground leading-snug">
              {(['goldInfoRule1', 'goldInfoRule2', 'goldInfoRule3', 'goldInfoRule4'] as const).map((k, i) => (
                <li key={k} className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-game-gold text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ol>
            <button
              onClick={() => setShowInfo(false)}
              className="mt-5 w-full py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold"
            >
              {t('ok')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
