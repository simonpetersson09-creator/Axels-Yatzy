import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { setLateRewardHandler } from '@/lib/admob';
import { awardAdXp } from '@/lib/dice-shop';
import { trackEvent } from '@/lib/analytics';
import { useTranslation } from '@/lib/i18n';

/**
 * App-wide receiver for rewarded-ad XP earned after the tap handler already
 * returned (late open). Mounted once at the app root so the reward reaches the
 * server on any page; the server still grants 1 XP with its own cooldown.
 */
export default function RewardedXpHost() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    setLateRewardHandler(() => {
      void awardAdXp().then((r) => {
        trackEvent('ad_xp_result', { ok: r.ok, late: true, reason: r.ok === false ? r.reason : undefined });
        if (r.ok) toast.success(tRef.current('xpEarned', { n: r.xp }), { duration: 6000 });
        else toast.error(tRef.current('errGeneric'));
      });
    });
    return () => setLateRewardHandler(null);
  }, []);
  return null;
}
