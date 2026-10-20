import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { optionalAdPair } from '@/lib/rewarded-pair';
import { awardAdXp } from '@/lib/dice-shop';
import { trackEvent } from '@/lib/analytics';
import { useTranslation } from '@/lib/i18n';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * App-wide receiver: each completed optional ad requests one server XP.
 * The XP request is retried a few times — a transient server error must not
 * cost the player the XP they already watched an ad for.
 */
export default function RewardedXpHost() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    optionalAdPair.setRewardHandler(() => {
      void (async () => {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const r = await awardAdXp();
            trackEvent('ad_xp_result', { ok: r.ok, late: true, reason: r.ok === false ? r.reason : undefined, attempt });
            if (r.ok) { toast.success(tRef.current('xpEarned', { n: r.xp }), { duration: 6000 }); return; }
            // Cooldown means the XP was already granted recently — not worth retrying.
            if (r.ok === false && r.reason === 'cooldown') return;
          } catch { /* retry below */ }
          if (attempt < 3) await wait(1500 * attempt);
        }
        toast.error(tRef.current('errGeneric'));
      })();
    });
    return () => optionalAdPair.setRewardHandler(null);
  }, []);
  return null;
}
