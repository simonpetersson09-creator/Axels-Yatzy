import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { optionalAdPair } from '@/lib/rewarded-pair';
import { flushAdRewardReceipts } from '@/lib/ad-reward-delivery';
import { flushResultReports } from '@/lib/result-delivery';
import { initDeviceId } from '@/lib/device';
import { useTranslation } from '@/lib/i18n';

/**
 * App-wide receiver: one SDK-confirmed completed ad requests one server XP.
 * The XP request is retried a few times — a transient server error must not
 * cost the player the XP they already watched an ad for.
 */
export default function RewardedXpHost() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' || localStorage.getItem('mrb_data_deletion_cleanup') === '1') return;
      void initDeviceId().then(() => flushAdRewardReceipts(xp => toast.success(tRef.current('xpEarned', { n: xp }), { duration: 6000 })));
      void flushResultReports();
    };
    optionalAdPair.setRewardHandler(flush);
    flush();
    const timer = setInterval(flush, 15_000);
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      optionalAdPair.setRewardHandler(null);
      clearInterval(timer);
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);
  return null;
}
