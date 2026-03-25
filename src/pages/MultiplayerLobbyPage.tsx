import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Copy, Check, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';

import type { RealtimeChannel } from '@supabase/supabase-js';

interface LobbyPlayer {
  id: string;
  player_name: string;
  player_index: number;
}

const MAX_NAME_LENGTH = 20;
const NAME_REGEX = /^[\p{L}\p{N}\s\-_.!]+$/u;

export default function MultiplayerLobbyPage() {
  const navigate = useNavigate();
  const sessionId = getSessionId();

  const [mode, setMode] = useState<'choose' | 'waiting'>('choose');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gameId, setGameId] = useState<string | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [myPlayerIndex, setMyPlayerIndex] = useState<number | null>(null);
  const [gameStatus, setGameStatus] = useState<string>('waiting');

  // Subscribe to realtime
  useEffect(() => {
    if (!gameId) return;
    let channel: RealtimeChannel;

    const refresh = async () => {
      const [gameRes, playersRes] = await Promise.all([
        supabase.from('games').select('status').eq('id', gameId).single(),
        supabase.from('game_players').select('id, player_name, player_index').eq('game_id', gameId).order('player_index'),
      ]);
      if (playersRes.data) {
        setPlayers(playersRes.data);
      }
      if (gameRes.data) setGameStatus(gameRes.data.status);
    };

    refresh();

    channel = supabase
      .channel(`yatzy-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, refresh)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameId, sessionId]);

  // Navigate to game when started
  useEffect(() => {
    if (gameStatus === 'playing' && gameId) {
      navigate(`/multiplayer-game?gameId=${gameId}`);
    }
  }, [gameStatus, gameId, navigate]);

  const sanitizeName = (raw: string): string => {
    const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
    if (!trimmed) return '';
    if (!NAME_REGEX.test(trimmed)) return '';
    return trimmed;
  };

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    const name = sanitizeName(playerName) || 'Spelare 1';

    const { data, error: rpcErr } = await supabase.rpc('create_game_with_code', {
      p_player_name: name,
      p_session_id: sessionId,
    });

    if (rpcErr || !data) {
      setError('Kunde inte skapa spel');
      setLoading(false);
      return;
    }

    const result = data as { success: boolean; error?: string; game_id?: string; game_code?: string };

    if (!result.success) {
      setError(result.error || 'Kunde inte skapa spel');
      setLoading(false);
      return;
    }

    setGameId(result.game_id!);
    setGameCode(result.game_code!);
    setMyPlayerIndex(0);
    setMode('waiting');
    setLoading(false);
  };

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    const name = sanitizeName(playerName) || 'Spelare';

    const { data, error: rpcErr } = await supabase.rpc('join_game', {
      p_game_code: joinCode.toUpperCase(),
      p_player_name: name,
      p_session_id: sessionId,
    });

    if (rpcErr || !data) {
      setError('Kunde inte gå med i spelet');
      setLoading(false);
      return;
    }

    const result = data as { success: boolean; error?: string; game_id?: string; game_code?: string; player_index?: number };

    if (!result.success) {
      setError(result.error || 'Kunde inte gå med');
      setLoading(false);
      return;
    }

    setGameId(result.game_id!);
    setGameCode(result.game_code!);
    setMode('waiting');
    setLoading(false);
  };

  const handleStart = async () => {
    if (!gameId) return;
    const { data, error } = await supabase.functions.invoke('start-game', {
      body: { game_id: gameId, session_id: sessionId },
    });
    if (error || (data && !data.success)) {
      setError(data?.error || 'Kunde inte starta spelet');
    }
  };

  const copyCode = () => {
    if (gameCode) {
      navigator.clipboard.writeText(gameCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isHost = myPlayerIndex === 0;

  // Waiting room
  if (mode === 'waiting' && gameCode) {
    return (
      <div className="min-h-screen px-6 py-8 safe-top safe-bottom">
        <motion.div
          className="max-w-sm mx-auto space-y-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="text-2xl font-display font-bold">Väntar på spelare</h1>
          </div>

          {/* Game code */}
          <div className="glass-card p-6 text-center space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Spelkod</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl font-display font-bold text-gold-gradient tracking-[0.3em]">
                {gameCode}
              </span>
              <button onClick={copyCode} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                {copied ? <Check className="w-5 h-5 text-game-success" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Dela koden med dina vänner</p>
          </div>

          {/* Players list */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Spelare ({players.length}/4)
              </span>
            </div>
            <div className="space-y-2">
              {players.map((player, i) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="glass-card px-4 py-3 flex items-center gap-3"
                >
                  <div className={`w-3 h-3 rounded-full ${
                    i === 0 ? 'bg-yatzy-player1' : i === 1 ? 'bg-yatzy-player2' : i === 2 ? 'bg-yatzy-player3' : 'bg-yatzy-player4'
                  }`} />
                  <span className="font-medium text-foreground">{player.player_name}</span>
                  {i === 0 && <span className="ml-auto text-[10px] text-primary font-bold uppercase tracking-wider">Värd</span>}
                  {i === myPlayerIndex && i !== 0 && (
                    <span className="ml-auto text-[10px] text-game-success font-bold uppercase tracking-wider">Du</span>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {isHost && players.length >= 2 && (
            <motion.button
              onClick={handleStart}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow"
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Starta spel
            </motion.button>
          )}

          {isHost && players.length < 2 && (
            <p className="text-center text-sm text-muted-foreground">Väntar på minst en spelare till...</p>
          )}

          {!isHost && (
            <p className="text-center text-sm text-muted-foreground">Väntar på att värden startar spelet...</p>
          )}
        </motion.div>
      </div>
    );
  }

  // Choose mode
  return (
    <div className="min-h-screen px-6 py-8 safe-top safe-bottom">
      <motion.div
        className="max-w-sm mx-auto space-y-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-2xl font-display font-bold">Multiplayer</h1>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Ditt namn</label>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Ange ditt namn"
            className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-medium border border-border/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </div>

        {error && (
          <motion.p className="text-destructive text-sm font-medium text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {error}
          </motion.p>
        )}

        <div className="space-y-3">
          <motion.button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow disabled:opacity-50"
            whileTap={{ scale: 0.97 }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Skapa spel'}
          </motion.button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">eller</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <input
            type="text"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Ange spelkod"
            maxLength={6}
            className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-display font-bold text-center text-xl tracking-[0.3em] border border-border/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all uppercase"
          />
          <motion.button
            onClick={handleJoin}
            disabled={loading || joinCode.length < 6}
            className="w-full py-4 rounded-2xl bg-secondary text-foreground font-display font-bold text-lg border border-border/50 disabled:opacity-50"
            whileTap={{ scale: 0.97 }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Gå med'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
