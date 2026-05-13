import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { QUICK_MESSAGES, playQuickMessagePop, type QuickMessage } from '@/lib/quick-messages';
import { trackEvent } from '@/lib/analytics';
import type { RealtimeChannel } from '@supabase/supabase-js';

const COOLDOWN_MS = 4000;
const BUBBLE_DURATION_MS = 3500;
const MAX_BUBBLES = 4;

interface IncomingBubble {
  key: string;
  text: string;
  fromName: string;
  fromPlayerIndex: number;
  isMe: boolean;
}

interface QuickChatProps {
  gameId: string;
  myPlayerIndex: number | null;
  myName: string;
  inline?: boolean;
}

const PLAYER_BUBBLE_COLORS = [
  'bg-yatzy-player1/95 text-white',
  'bg-yatzy-player2/95 text-white',
  'bg-yatzy-player3/95 text-white',
  'bg-yatzy-player4/95 text-white',
];

export function QuickChat({ gameId, myPlayerIndex, myName, inline = false }: QuickChatProps) {
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<IncomingBubble[]>([]);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const lastSentRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addBubble = useCallback((b: IncomingBubble) => {
    setBubbles((prev) => {
      const next = [...prev, b];
      return next.slice(-MAX_BUBBLES);
    });
    setTimeout(() => {
      setBubbles((prev) => prev.filter((x) => x.key !== b.key));
    }, BUBBLE_DURATION_MS);
  }, []);

  // Subscribe to broadcast channel for this game
  useEffect(() => {
    if (!gameId) return;
    const ch = supabase.channel(`quick-chat-${gameId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'quick_message' }, (payload) => {
      const data = payload.payload as {
        message_id?: string;
        text?: string;
        from_name?: string;
        from_index?: number;
      };
      if (!data.text) return;
      const isMe = data.from_index === myPlayerIndex;
      addBubble({
        key: `${Date.now()}-${Math.random()}`,
        text: data.text,
        fromName: data.from_name ?? '—',
        fromPlayerIndex: data.from_index ?? 0,
        isMe,
      });
      if (!isMe) {
        playQuickMessagePop();
        trackEvent('quick_message_received', { message_id: data.message_id, from_index: data.from_index }, { gameId, gameMode: 'multiplayer' });
      }
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [gameId, myPlayerIndex, addBubble]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastSentRef.current;
      const left = Math.max(0, COOLDOWN_MS - elapsed);
      setCooldownLeft(left);
    }, 200);
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  const send = useCallback(
    async (msg: QuickMessage) => {
      const now = Date.now();
      if (now - lastSentRef.current < COOLDOWN_MS) return;
      if (myPlayerIndex === null) return;
      lastSentRef.current = now;
      setOpen(false);

      // Optimistically add my own bubble locally (since broadcast self:false)
      addBubble({
        key: `${now}-self`,
        text: msg.text,
        fromName: myName || 'Du',
        fromPlayerIndex: myPlayerIndex,
        isMe: true,
      });

      try {
        await channelRef.current?.send({
          type: 'broadcast',
          event: 'quick_message',
          payload: {
            message_id: msg.id,
            text: msg.text,
            from_name: myName,
            from_index: myPlayerIndex,
          },
        });
      } catch (err) {
        console.warn('[quick-chat] broadcast failed', err);
      }

      trackEvent('quick_message_sent', { message_id: msg.id }, { gameId, gameMode: 'multiplayer' });
    },
    [gameId, myPlayerIndex, myName, addBubble],
  );

  const onCooldown = cooldownLeft > 0;

  const bubblePositionClasses = inline
    ? 'pointer-events-none fixed left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-1.5'
    : 'pointer-events-none fixed left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-1.5';

  const buttonPositionClasses = inline
    ? 'relative z-[50] w-12 h-12 rounded-full bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_6px_20px_-4px_hsl(0_0%_0%/0.5)] flex items-center justify-center active:scale-95 transition-transform'
    : 'fixed z-[70] w-12 h-12 rounded-full bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_6px_20px_-4px_hsl(0_0%_0%/0.5)] flex items-center justify-center active:scale-95 transition-transform';

  const panelBottom = inline
    ? 'calc(env(safe-area-inset-bottom) + 80px)'
    : 'calc(env(safe-area-inset-bottom) + 76px)';

  const bubbleStyle = inline ? undefined : { top: 'calc(env(safe-area-inset-top) + 12px)' };
  const buttonStyle = inline
    ? { WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }
    : {
        right: 'calc(env(safe-area-inset-right) + 12px)',
        bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      };

  const content = (
    <>
      {/* Bubble overlay */}
      <div className={bubblePositionClasses} style={bubbleStyle}>
        <AnimatePresence>
          {bubbles.map((b) => (
            <motion.div
              key={b.key}
              initial={{ opacity: 0, y: -12, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.9, transition: { duration: 0.25 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className={`${inline ? 'max-w-[180px]' : 'max-w-[260px]'} px-3.5 py-2 rounded-2xl shadow-lg backdrop-blur-sm flex items-baseline gap-2 ${
                PLAYER_BUBBLE_COLORS[b.fromPlayerIndex] ?? 'bg-secondary text-foreground'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 truncate max-w-[60px]">
                {b.isMe ? 'Du' : b.fromName}
              </span>
              <span className="text-[13px] font-medium leading-tight">{b.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Chat button */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Snabbmeddelanden"
        className={buttonPositionClasses}
        style={buttonStyle}
      >
        <MessageCircle className="w-5 h-5" strokeWidth={2.5} />
      </button>

      {/* Popup */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[75] bg-black/30 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className="fixed z-[76] w-[min(320px,calc(100vw-24px))] rounded-3xl bg-card border border-border/60 shadow-2xl overflow-hidden"
              style={{
                right: 'calc(env(safe-area-inset-right) + 12px)',
                bottom: panelBottom,
              }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                <p className="text-sm font-display font-bold">Snabbmeddelanden</p>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg active:bg-secondary"
                  aria-label="Stäng"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                {QUICK_MESSAGES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={onCooldown}
                    onClick={() => send(m)}
                    className={`px-3 py-2.5 rounded-xl text-[13px] font-medium text-left active:scale-95 transition-all ${
                      onCooldown
                        ? 'bg-secondary/40 text-muted-foreground/60'
                        : 'bg-secondary/80 text-foreground hover:bg-secondary active:bg-primary/20'
                    }`}
                  >
                    {m.text}
                  </button>
                ))}
              </div>
              {onCooldown && (
                <p className="px-4 pb-3 text-[10px] text-muted-foreground/70 text-center">
                  Vänta {Math.ceil(cooldownLeft / 1000)}s innan nästa meddelande
                </p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );

  if (inline) {
    return <div className="relative inline-flex flex-col items-center">{content}</div>;
  }

  return content;
}
