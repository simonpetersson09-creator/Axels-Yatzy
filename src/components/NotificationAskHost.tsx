import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import NotificationAskPrompt from '@/components/NotificationAskPrompt';
import { requestPushPermission } from '@/lib/notifications';
import { trackEvent } from '@/lib/analytics';
import type { NotifAskDetail } from '@/lib/notif-context';

/** Global host for context-aware notification asks (see notif-context.ts). */
export default function NotificationAskHost() {
  const [ask, setAsk] = useState<NotifAskDetail | null>(null);

  useEffect(() => {
    const h = (e: Event) => setAsk((e as CustomEvent<NotifAskDetail>).detail);
    window.addEventListener('app:notif-ask', h);
    return () => window.removeEventListener('app:notif-ask', h);
  }, []);

  const close = async (yes: boolean) => {
    const ctx = ask?.context;
    setAsk(null);
    trackEvent(yes ? 'notif_ask_yes' : 'notif_ask_later', { context: ctx });
    if (yes) await requestPushPermission();
  };

  return (
    <AnimatePresence>
      {ask && (
        <NotificationAskPrompt
          context={ask.context}
          name={ask.name}
          onYes={() => close(true)}
          onLater={() => close(false)}
        />
      )}
    </AnimatePresence>
  );
}
