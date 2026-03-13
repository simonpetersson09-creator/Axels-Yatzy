import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Copy, Check, Users, Loader2 } from 'lucide-react';
import { useMultiplayerGame } from '@/hooks/useMultiplayerGame';

export default function MultiplayerLobbyPage() {
  const navigate = useNavigate();
  const { gameCode, status, gameState, myPlayerIndex, loading, error, createGame, joinGame, startGame } = useMultiplayerGame();

  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    const name = playerName.trim() || 'Spelare 1';
    const code = await createGame(name);
    if (code) setMode('create');
  };

  const handleJoin = async () => {
    const name = playerName.trim() || 'Spelare';
    const success = await joinGame(joinCode, name);
    if (success) setMode('join');
  };

  const copyCode = () => {
    if (gameCode) {
      navigator.clipboard.writeText(gameCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // If game has started, navigate to multiplayer game
  if (status === 'playing' && gameState) {
    navigate('/multiplayer-game', { state: { gameId: gameState.players[0]?.id ? undefined : undefined } });
  }

  const playerCount = gameState?.players.length ?? 0;
  const isHost = myPlayerIndex === 0;

  // Waiting room
  if (gameCode && (mode === 'create' || mode === 'join')) {
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
              <button
                onClick={copyCode}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
              >
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
                Spelare ({playerCount}/4)
              </span>
            </div>
            <div className="space-y-2">
              {gameState?.players.map((player, i) => (
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
                  <span className="font-medium text-foreground">{player.name}</span>
                  {i === 0 && <span className="ml-auto text-[10px] text-primary font-bold uppercase tracking-wider">Värd</span>}
                  {i === myPlayerIndex && <span className="ml-auto text-[10px] text-game-success font-bold uppercase tracking-wider">Du</span>}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Start button (host only) */}
          {isHost && playerCount >= 2 && (
            <motion.button
              onClick={startGame}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow"
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Starta spel
            </motion.button>
          )}

          {isHost && playerCount < 2 && (
            <p className="text-center text-sm text-muted-foreground">
              Väntar på minst en spelare till...
            </p>
          )}

          {!isHost && (
            <p className="text-center text-sm text-muted-foreground">
              Väntar på att värden startar spelet...
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  // Choose mode / Enter name
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

        {/* Player name */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Ditt namn
          </label>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Ange ditt namn"
            className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-medium border border-border/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </div>

        {error && (
          <motion.p
            className="text-destructive text-sm font-medium text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {error}
          </motion.p>
        )}

        {mode === 'choose' && (
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

            <div className="space-y-3">
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
                disabled={loading || joinCode.length < 4}
                className="w-full py-4 rounded-2xl bg-secondary text-foreground font-display font-bold text-lg border border-border/50 disabled:opacity-50"
                whileTap={{ scale: 0.97 }}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Gå med'}
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
