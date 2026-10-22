import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { ArrowLeft, Bell, Check, Clock, LogOut, Plus, Share2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { roomAction, savedWaitingSeat, type RoomAction, type WaitingSnapshot } from '@/lib/waiting-room';
import { remainingTime } from '@/lib/waiting-room-rules';
import { getSessionId } from '@/lib/session';
import { getPushPermissionState, requestPushPermission } from '@/lib/notifications';
import { PUBLIC_WEB_ORIGIN } from '@/lib/app-links';
import table from '@/assets/waiting-table.png';

export default function WaitingRoomPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [snapshot, setSnapshot] = useState<WaitingSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [askPush, setAskPush] = useState(false);
  const [pushUnavailable, setPushUnavailable] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(0);
  const seatRef = useRef<string | null>(params.get('seat') || savedWaitingSeat());
  const mutation = useRef(false);
  const mounted = useRef(true);
  const serial = useRef(Promise.resolve());
  const active = useRef(document.visibilityState === 'visible');
  const lastCountdown = useRef<string | null>(null);
  const entered = useRef(false);

  const perform = useCallback((action: RoomAction, options: { ready?: boolean; notify?: boolean } = {}) => {
    // Serialize heartbeat/away/ready, so a slow foreground request cannot undo background state.
    const run = serial.current.then(async () => {
      try {
        const response = await roomAction(action, { seatId: seatRef.current, ...options });
        if (!mounted.current) return;
        offset.current = Date.parse(response.server_now) - Date.now();
        seatRef.current = response.mine?.id ?? (response.error === 'expired' ? null : seatRef.current);
        setSnapshot(response);
        setConnectionLost(false);
        if (lastCountdown.current && !response.countdown_at && !response.mine?.game_id) toast.info(t('wrCancelled'));
        lastCountdown.current = response.countdown_at;
        if (response.mine?.game_id && action !== 'away' && action !== 'leave') {
          navigate(`/multiplayer-game?gameId=${response.mine.game_id}`, { replace: true });
        }
      } catch {
        if (mounted.current) setConnectionLost(true);
      }
    });
    serial.current = run;
    return run;
  }, [navigate, t]);
  const performRef = useRef(perform);
  performRef.current = perform;

  useEffect(() => {
    mounted.current = true;
    if (!entered.current) {
      entered.current = true;
      void performRef.current(seatRef.current ? 'open' : 'join');
    }
    const time = setInterval(() => setClock(Date.now() + offset.current), 250);
    const heartbeat = setInterval(() => {
      if (active.current) void performRef.current('heartbeat');
    }, 5_000);
    const tick = setInterval(() => {
      if (active.current && lastCountdown.current) void performRef.current('sync');
    }, 1000);
    const stateChanged = (isActive: boolean) => {
      if (active.current === isActive) return;
      active.current = isActive;
      void performRef.current(isActive ? 'open' : 'away');
    };
    const visibility = () => stateChanged(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    let nativeRemove: (() => void) | undefined;
    let disposed = false;
    if (Capacitor.isNativePlatform()) void import('@capacitor/app').then(async ({ App }) => {
      const listener = await App.addListener('appStateChange', ({ isActive }) => stateChanged(isActive));
      if (disposed) void listener.remove(); else nativeRemove = () => void listener.remove();
    });
    const channel = supabase.channel('waiting-room-table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiting_room_state' }, () => {
        if (active.current) void performRef.current('sync');
      }).subscribe();
    return () => {
      mounted.current = false; disposed = true;
      clearInterval(time); clearInterval(heartbeat); clearInterval(tick);
      document.removeEventListener('visibilitychange', visibility); nativeRemove?.();
      void supabase.removeChannel(channel);
      // Navigating home also retains the seat, but marks it absent from this table.
      void serial.current.then(() => roomAction('away', { seatId: seatRef.current })).catch(() => {});
    };
  }, []);

  const command = async (action: RoomAction, options: { ready?: boolean; notify?: boolean } = {}) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true);
    await perform(action, options);
    mutation.current = false; if (mounted.current) setBusy(false);
  };
  const enablePush = async () => {
    setAskPush(false);
    const permission = await getPushPermissionState();
    const granted = permission === 'granted' || (permission === 'prompt' && await requestPushPermission());
    setPushUnavailable(!granted);
    await command('notify', { notify: granted });
  };
  const share = async () => {
    const url = `${PUBLIC_WEB_ORIGIN}/join?waitingRoom=1`;
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: 'Mr.B. Yatzy', text: t('wrShare'), url });
      else if (navigator.share) await navigator.share({ title: 'Mr.B. Yatzy', text: t('wrShare'), url });
      else { await navigator.clipboard.writeText(`${t('wrShare')} ${url}`); toast.success(t('inviteCopiedMsg')); }
    } catch { /* cancelled shares do not change the waiting seat */ }
  };
  const mine = snapshot?.mine;
  const players = snapshot?.players ?? [];
  const countdown = snapshot?.countdown_at ? Math.max(1, 3 - Math.floor((clock - Date.parse(snapshot.countdown_at)) / 1000)) : null;
  const errorKey = snapshot?.error === 'full' ? 'wrFull' : snapshot?.error === 'starting' ? 'wrStarting' : snapshot?.error === 'expired' ? 'wrExpired' : null;

  return <main className="waiting-room-screen">
    <div className="waiting-room-content">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label={t('back')} onClick={() => navigate('/')}><ArrowLeft /></Button>
        <h1 className="font-display text-2xl font-bold">{t('wrTitle')}</h1>
        <span className="ml-auto text-muted-foreground tabular-nums text-sm">{players.length}/4</span>
      </header>
      <div className="text-center min-h-12 pt-3" role="status">
        {connectionLost ? <p className="text-destructive text-sm">{t('wrConnection')}</p> :
          <p className="text-muted-foreground text-sm">{countdown ? t('wrCountdown') : players.length <= 1 ? t('wrEmpty') : t('wrWaitingReady')}</p>}
      </div>
      <section className="waiting-table-stage" aria-label={t('wrTitle')}>
        <img src={table} width={1024} height={1024} alt="" className="waiting-table-image" />
        {[0, 1, 2, 3].map(seat => {
          const p = players.find(player => player.seat === seat);
          const own = p?.session_id === getSessionId();
          return <div key={seat} className={`waiting-seat waiting-seat-${seat}`}>
            <div className="waiting-person-label">
              <p className="font-semibold text-sm break-words">{p?.player_name || t('wrSeat')}{own && <span className="text-primary text-xs block">{t('you')}</span>}</p>
              {p && <p className={`text-[11px] leading-tight ${p.ready ? 'text-game-success' : 'text-muted-foreground'}`}>
                {p.ready ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" />{t('wrReady')}</span> : !p.present ? t('wrAway') : '—'}
              </p>}
              {p?.recall_until && <p className="text-[10px] text-primary leading-tight">{t('wrRecall', { time: remainingTime(p.recall_until, clock) })}</p>}
            </div>
            {p && <div className={`waiting-figure figure-${seat} ${!p.present ? 'opacity-50' : ''}`}><UserRound aria-hidden="true" /></div>}
          </div>;
        })}
        {countdown && <div className="waiting-countdown" role="timer">{countdown}</div>}
      </section>
      <div className="space-y-3">
        {errorKey && <p role="alert" className="text-center text-primary text-sm">{t(errorKey)}</p>}
        {mine && !mine.game_id ? <>
          <Button className="w-full h-14 font-display text-lg whitespace-normal" disabled={busy || !!countdown || connectionLost} onClick={() => void command('ready', { ready: !mine.ready })}>
            <Check /> {t(mine.ready ? 'wrUndo' : 'wrBeReady')}
          </Button>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground tabular-nums"><Clock className="w-4 h-4" />{t('wrLeft', { time: remainingTime(mine.expires_at, clock) })}</div>
          <Button variant="ghost" className="w-full whitespace-normal h-auto min-h-11" disabled={busy || !!countdown} onClick={() => void command('extend')}><Plus />{t('wrExtend')}</Button>
          {players.length === 1 && <Button variant="secondary" className="w-full min-h-12 whitespace-normal" onClick={() => void share()}><Share2 />{t('wrInvite')}</Button>}
          <Button variant="outline" className="w-full min-h-12 whitespace-normal" disabled={busy || !!countdown} onClick={() => mine.notify_enabled ? void command('notify', { notify: false }) : setAskPush(true)}><Bell />{t(mine.notify_enabled ? 'wrPushOn' : 'wrNotify')}</Button>
          {(pushUnavailable || (mine.notify_enabled && !snapshot?.push_registered)) && <p className="text-xs text-primary text-center" role="status">{t('wrNoPush')}</p>}
          <Button variant="ghost" className="w-full min-h-12 text-muted-foreground whitespace-normal" disabled={busy} onClick={() => void command('leave')}><LogOut />{t('wrLeave')}</Button>
        </> : <Button className="w-full min-h-12 whitespace-normal" disabled={busy || !snapshot} onClick={() => { seatRef.current = null; void command('join'); }}><Plus />{t('wrJoin')}</Button>}
        {connectionLost && <Button variant="secondary" className="w-full" onClick={() => void command('sync')}>{t('wrRetry')}</Button>}
      </div>
    </div>
    {askPush && <div className="waiting-modal-backdrop" role="dialog" aria-modal="true" aria-label={t('wrNotify')}>
      <div className="bg-popover text-popover-foreground border border-border rounded-lg p-6 max-w-sm w-full space-y-5">
        <Bell className="w-8 h-8 text-primary mx-auto" /><p className="text-center font-semibold">{t('wrNotifyAsk')}</p>
        <Button className="w-full" onClick={() => void enablePush()}>{t('notifAskYes')}</Button>
        <Button variant="ghost" className="w-full" onClick={() => setAskPush(false)}>{t('notifAskLater')}</Button>
      </div>
    </div>}
  </main>;
}