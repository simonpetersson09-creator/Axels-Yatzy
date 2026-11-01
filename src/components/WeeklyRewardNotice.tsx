import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';
import { weeklyRewardCopy } from '@/lib/weekly-reward-copy';
import { acknowledgeWeeklyRewards, type WeeklyReward } from '@/lib/weekly-rewards';

export function WeeklyRewardNotice({ rewards, onAcknowledged }: { rewards: WeeklyReward[]; onAcknowledged: (week: string) => void }) {
  const { t, lang } = useTranslation();
  const copy = weeklyRewardCopy(lang);
  const week = rewards[0]?.week_start;
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  const close = async () => {
    if (!week || pending.current) return;
    pending.current = true;
    setSaving(true);
    const ok = await acknowledgeWeeklyRewards(week);
    pending.current = false;
    setSaving(false);
    setFailed(!ok);
    if (ok) onAcknowledged(week);
  };
  useBackHandler(true, () => { void close(); });
  return createPortal(
      <dialog ref={dialogRef} aria-labelledby="weekly-reward-title"
        onCancel={event => { event.preventDefault(); void close(); }}
        className="fixed inset-0 m-auto w-[calc(100%-48px)] max-w-sm max-h-[calc(100dvh-96px)] overflow-y-auto rounded-lg border border-primary/40 bg-card p-6 text-foreground text-center shadow-2xl backdrop:bg-background/70 backdrop:backdrop-blur-sm space-y-4">
        <Trophy className="mx-auto h-10 w-10 text-game-gold" aria-hidden />
        <h2 id="weekly-reward-title" className="font-display text-xl font-bold">{copy.title}</h2>
        <p className="text-3xl font-display font-bold text-primary">+{rewards.reduce((sum, reward) => sum + reward.xp, 0)} XP</p>
        {rewards.map(reward => (
          <div key={reward.list} className="space-y-1">
            <p className="font-semibold">{t(reward.list === 'score' ? 'hofTitle' : 'hofGamesTitle')}</p>
            <p className="text-sm text-muted-foreground">{copy.result(reward.rank, reward.xp)}</p>
          </div>
        ))}
        {failed && <p role="alert" className="text-sm text-destructive">{t('errGeneric')}</p>}
        <Button disabled={saving} onClick={() => { void close(); }}>{saving ? t('loading') : t('ok')}</Button>
      </dialog>, document.body,
  );
}