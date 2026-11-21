import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useBackHandler } from '@/lib/back-handler';
import { getSessionId } from '@/lib/session';
import { dismissWaitingExpiry, roomAction, savedWaitingSeat } from '@/lib/waiting-room';
import { subscribeWaitingExpiryNotice, waitingExpiryNotice } from '@/lib/waiting-room-expiry-notice';
import { getWaitingRoomExpiryCopy } from '../../supabase/functions/_shared/waiting-room-expiry-copy';

export default function WaitingRoomExpiryHost() {
  const { t, lang } = useTranslation();
  const { pathname } = useLocation();
  const notice = useSyncExternalStore(subscribeWaitingExpiryNotice, () => waitingExpiryNotice(getSessionId()));
  const [active, setActive] = useState(document.visibilityState === 'visible');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const allowed = !pathname.startsWith('/admin') && pathname !== '/game' && pathname !== '/multiplayer-game';
  const open = !!notice && active && allowed;
  const close = async () => {
    if (!notice || pending.current) return;
    pending.current = true; setBusy(true); setFailed(false);
    try { await dismissWaitingExpiry(notice.id); }
    catch { setFailed(true); }
    finally { pending.current = false; setBusy(false); }
  };
  useBackHandler(open, () => { void close(); });
  useEffect(() => {
    let disposed = false;
    let removeNative: (() => void) | undefined;
    let reading = false;
    const returned = (isActive: boolean) => {
      if (disposed) return;
      setActive(isActive);
      if (!isActive || !allowed || reading || (!Capacitor.isNativePlatform() && !savedWaitingSeat())) return;
      reading = true;
      // Validate only: never joins, extends presence, or restores a removed seat.
      void roomAction('sync', { seatId: savedWaitingSeat() }).catch(() => {}).finally(() => { reading = false; });
    };
    const visibility = () => returned(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    if (Capacitor.isNativePlatform()) void import('@capacitor/app').then(async ({ App }) => {
      const listener = await App.addListener('appStateChange', ({ isActive }) => returned(isActive));
      if (disposed) void listener.remove(); else removeNative = () => void listener.remove();
    });
    return () => { disposed = true; document.removeEventListener('visibilitychange', visibility); removeNative?.(); };
  }, [allowed]);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal();
    return () => element.close();
  }, [open]);
  if (!open || !notice) return null;
  const message = notice.player_names.trim()
    ? getWaitingRoomExpiryCopy(lang).missed.replace('{name}', notice.player_names)
    : t('wrExpired');
  return createPortal(<dialog ref={dialog} aria-labelledby="waiting-expiry-title" aria-describedby="waiting-expiry-body"
    onCancel={event => { event.preventDefault(); void close(); }}
    className="fixed inset-0 m-auto w-[calc(100%-40px)] max-w-sm max-h-[calc(100dvh-80px)] overflow-y-auto rounded-lg border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-background/80">
    <Clock className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
    <h2 id="waiting-expiry-title" className="mt-3 text-center font-display text-xl font-bold">{t('wrTitle')}</h2>
    <p id="waiting-expiry-body" className="mt-4 text-center text-sm leading-relaxed break-words">{message}</p>
    {failed && <p role="alert" className="mt-3 text-center text-sm text-destructive">{t('wrConnection')}</p>}
    <Button className="mt-6 w-full" disabled={busy} onClick={() => void close()}>{failed ? t('wrRetry') : t('ok')}</Button>
  </dialog>, document.body);
}