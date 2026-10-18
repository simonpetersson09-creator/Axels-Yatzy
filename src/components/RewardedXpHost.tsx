import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { optionalAdPair } from '@/lib/rewarded-pair';
import { awardAdXp } from '@/lib/dice-shop';
import { trackEvent } from '@/lib/analytics';
import { useTranslation } from '@/lib/i18n';

/**
 * App-wide receiver: only a completed two-ad bundle requests one server XP.
 */
export default function RewardedXpHost() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    optionalAdPair.setRewardHandler(() => {
      void awardAdXp().then((r) => {
        trackEvent('ad_xp_result', { ok: r.ok, late: true, reason: r.ok === false ? r.reason : undefined });
        if (r.ok) toast.success(tRef.current('xpEarned', { n: r.xp }), { duration: 6000 });
        else toast.error(tRef.current('errGeneric'));
      });
    });
    return () => optionalAdPair.setRewardHandler(null);
  }, []);
  return null;
}
