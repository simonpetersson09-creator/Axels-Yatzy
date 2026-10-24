import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, Bell, Check, Clock, LogOut, MessageCircle, Plus, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { roomAction, savedWaitingSeat, type RoomAction, type WaitingSnapshot } from '@/lib/waiting-room';
import { remainingTime } from '@/lib/waiting-room-rules';
import { getSessionId } from '@/lib/session';
import { getPushPermissionState } from '@/lib/notifications';
import table from '@/assets/waiting-table.png';
import { useWaitingRoomChat } from '@/hooks/useWaitingRoomChat';
import { WAITING_PHRASES } from '@/lib/waiting-room-chat';
import { useBackHandler } from '@/lib/back-handler';
import { WaitingRoomWelcomeDialog } from '@/components/WaitingRoomWelcomeDialog';
import { takeWaitingRoomWelcome } from '@/lib/waiting-room-welcome';
import { useWaitingRoomCountries } from '@/hooks/useWaitingRoomCountries';
import { countryName, countryToFlag } from '@/lib/country-rank';
import { getProfileCountry } from '@/lib/profile';
import { WaitingRoomChoiceDialog } from '@/components/WaitingRoomChoiceDialog';

export default function WaitingRoomPage() {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [snapshot, setSnapshot] = useState<WaitingSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [chatOpen, setChatOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const requestBack = () => {
    if (mutation.current) return;
    if (snapshot?.mine && !snapshot.mine.game_id) setExitOpen(true);
    else navigate('/');
  };
  // Child dialog effects may mount first; suspend the page handler for every overlay.
  useBackHandler(!chatOpen && !welcomeOpen && !exitOpen && !leaveOpen, requestBack);
  const welcomeChecked = useRef(false);
  useEffect(() => {
    if (welcomeChecked.current) return;
    welcomeChecked.current = true;
    setWelcomeOpen(takeWaitingRoomWelcome());
  }, []);
  useBackHandler(chatOpen, () => setChatOpen(false));
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
        seatRef.current = response.mine?.id ?? (response.error === 'expired' || action === 'leave' ? null : seatRef.current);
        setSnapshot(response);
        setConnectionLost(false);
        if (action === 'leave' && !response.error) { seatRef.current = null; navigate('/', { replace: true }); }
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
    const notifiedSeat = params.get('seat');
    if (!notifiedSeat || notifiedSeat === seatRef.current) return;
    seatRef.current = notifiedSeat;
    void performRef.current('open');
  }, [params]);

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
      void serial.current.then(() => { if (seatRef.current) return roomAction('away', { seatId: seatRef.current }); }).catch(() => {});
    };
  }, []);

  const command = async (action: RoomAction, options: { ready?: boolean; notify?: boolean } = {}) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true);
    await perform(action, options);
    mutation.current = false; if (mounted.current) setBusy(false);
  };
  const mine = snapshot?.mine;
  const mineId = mine?.game_id ? null : mine?.id;
  useEffect(() => {
    if (!mineId) return;
    let cancelled = false;
    const syncPermission = async () => {
      const granted = await getPushPermissionState() === 'granted';
      if (cancelled || !mounted.current || seatRef.current !== mineId) return;
      // Reuse existing permission only; never open a system prompt automatically.
      void performRef.current('notify', { notify: granted });
    };
    void syncPermission();
    const onVisible = () => { if (document.visibilityState === 'visible') void syncPermission(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, [mineId]);
  const players = snapshot?.players ?? [];
  const countries = useWaitingRoomCountries(players.map(player => player.session_id));
  const chat = useWaitingRoomChat(players, mineId ?? null);
  const countdown = snapshot?.countdown_at ? Math.max(0, Math.min(3, 3 - Math.floor((clock - Date.parse(snapshot.countdown_at)) / 1000))) : null;
  const errorKey = snapshot?.error === 'full' ? 'wrFull' : snapshot?.error === 'starting' ? 'wrStarting' : snapshot?.error === 'expired' ? 'wrExpired' : null;

  return <main className="waiting-room-screen">
    <WaitingRoomWelcomeDialog open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
    <WaitingRoomChoiceDialog open={exitOpen} mode="exit" busy={busy}
      onClose={() => setExitOpen(false)} onSecondary={() => void command('leave')}
      onConfirm={() => { if (!mutation.current) navigate('/'); }} />
    <WaitingRoomChoiceDialog open={leaveOpen} mode="leave" busy={busy}
      onClose={() => setLeaveOpen(false)} onSecondary={() => setLeaveOpen(false)}
      onConfirm={() => void command('leave')} />
    <div className="waiting-room-content">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label={t('back')} onClick={requestBack}><ArrowLeft /></Button>
        <h1 className="font-display text-2xl font-bold">{t('wrTitle')}</h1>
        <span className="ml-auto text-muted-foreground tabular-nums text-sm">{players.length}/4</span>
      </header>
      <div className="text-center min-h-12 pt-3" role="status">
        {connectionLost ? <p className="text-destructive text-sm">{t('wrConnection')}</p> :
          <p className="text-muted-foreground text-sm">{countdown !== null ? t('wrCountdown') : players.length <= 1 ? t('wrEmpty') : t('wrWaitingReady')}</p>}
      </div>
      <section className="waiting-table-stage" aria-label={t('wrTitle')}>
        <img src={table} width={1024} height={1024} alt="" className="waiting-table-image" />
        {[0, 1, 2, 3].map(seat => {
          const p = players.find(player => player.seat === seat);
          const own = p?.session_id === getSessionId();
          const country = p ? (own ? getProfileCountry() || countries[p.session_id] : countries[p.session_id]) : null;
          return <div key={seat} className={`waiting-seat waiting-seat-${seat}`}>
            <div className={`waiting-person-label ${p ? '' : 'waiting-person-label-empty'}`}>
              <p className="font-semibold text-xs break-words">{p && <span role="img" aria-label={p.present ? t('onlineNow') : t('wrAway')} className={`waiting-presence ${p.present ? 'waiting-presence-online' : 'waiting-presence-away'}`} />}{country && <span role="img" aria-label={countryName(country, lang)} className="waiting-country-flag">{countryToFlag(country)}</span>}<span className="waiting-player-name" title={p?.player_name || undefined}>{p?.player_name || t('wrSeat')}</span>{own && <span className="text-primary text-[10px] block">{t('you')}</span>}</p>
              {p && <p className={`text-[11px] leading-tight ${p.ready ? 'text-game-success' : 'text-muted-foreground'}`}>
                {p.ready ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" />{t('wrReady')}</span> : !p.present ? t('wrAway') : '—'}
              </p>}
              {p?.recall_until && <p className="text-[10px] text-primary leading-tight">{t('wrReadyLeft', { time: remainingTime(p.recall_until, clock) })}</p>}
            </div>
            {p && <div aria-hidden="true" className={`waiting-figure figure-${seat} ${!p.present ? 'opacity-50' : ''}`}><span className="waiting-figure-legs" /><span className="waiting-figure-body" /><span className="waiting-figure-arms" /><span className="waiting-figure-head" /></div>}
            {p && chat.bubbles[p.id] && <div className="waiting-chat-bubble" role="status">{t(chat.bubbles[p.id].phrase)}</div>}
          </div>;
        })}
        {countdown !== null && <div className="waiting-countdown" role="timer">{countdown > 0 ? countdown : <span className="text-sm">{t('wrStarting')}</span>}</div>}
      </section>
      <div className="space-y-3">
        {errorKey && <p role="alert" className="text-center text-primary text-sm">{t(errorKey)}</p>}
        {mine && !mine.game_id ? <>
          <div className="flex items-center justify-center gap-3">
          <Button variant={mine.ready ? 'success' : 'default'} className="waiting-ready-button font-display font-bold text-base whitespace-normal" disabled={busy || countdown !== null || connectionLost} onClick={() => void command('ready', { ready: !mine.ready })}>
            <Check /> {t(mine.ready ? 'wrUndo' : 'wrBeReady')}
          </Button>
          <Button size="icon" className="h-12 w-12 rounded-full shrink-0" aria-label={t('quickMessages')} title={t('quickMessages')} disabled={!chat.connected || connectionLost || countdown !== null} onClick={() => setChatOpen(true)}><MessageCircle /></Button>
          </div>
          {mine.recall_until && <div className="flex items-center justify-center gap-2 text-sm text-primary tabular-nums"><Clock className="w-4 h-4" />{t('wrReadyLeft', { time: remainingTime(mine.recall_until, clock) })}</div>}
          <p className="text-[11px] leading-relaxed text-muted-foreground text-center flex items-start justify-center gap-1.5 max-w-72 mx-auto"><Bell className="w-3 h-3 shrink-0 mt-0.5" />{t('wrNotifyHint')}</p>
          <Button variant="ghost" className="w-full min-h-12 text-muted-foreground whitespace-normal" disabled={busy} onClick={() => setLeaveOpen(true)}><LogOut />{t('wrLeave')}</Button>
        </> : <Button className="w-full min-h-12 whitespace-normal" disabled={busy || !snapshot} onClick={() => { seatRef.current = null; void command('join'); }}><Plus />{t('wrJoin')}</Button>}
        {connectionLost && <Button variant="secondary" className="w-full" onClick={() => void command('sync')}>{t('wrRetry')}</Button>}
      </div>
    </div>
    {chatOpen && createPortal(<div className="waiting-modal-backdrop" onClick={() => setChatOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label={t('quickMessages')} className="waiting-chat-panel" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-4 py-2"><h2 className="font-display font-bold text-sm">{t('quickMessages')}</h2><Button variant="ghost" size="icon" aria-label={t('close')} onClick={() => setChatOpen(false)}><X /></Button></header>
        <div className="grid grid-cols-2 gap-2 p-3">{WAITING_PHRASES.map(phrase => <Button key={phrase} variant="secondary" className="h-auto min-h-12 text-xs whitespace-normal" onClick={() => { setChatOpen(false); void chat.send(phrase).then(ok => { if (!ok) toast.info(t('wrRetry')); }); }}>{t(phrase)}</Button>)}</div>
      </section>
    </div>, document.body)}
  </main>;
}