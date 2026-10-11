import { useEffect, useState } from 'react';
import { BellOff } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { getPushPermissionState } from '@/lib/notifications';
import { openAppNotificationSettings } from '@/lib/notif-context';

/** Small "notifications are off – turn on" row, only when the player said no. */
export default function NotificationsOffBanner({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => { void getPushPermissionState().then((s) => { if (alive) setDenied(s === 'denied'); }); };
    check();
    // Re-check when the player comes back from the phone's settings.
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (!denied) return null;
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-secondary/60 border border-game-gold/30 px-3 py-2.5 ${className}`}>
      <BellOff className="w-4 h-4 text-game-gold shrink-0" />
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-bold text-foreground">{t('notifOffTitle')}</p>
        <p className="text-[11px] text-muted-foreground leading-snug">{t('notifOffBody')}</p>
      </div>
      <button
        onClick={() => void openAppNotificationSettings()}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold active:scale-95 transition"
      >
        {t('notifOffAction')}
      </button>
    </div>
  );
}
