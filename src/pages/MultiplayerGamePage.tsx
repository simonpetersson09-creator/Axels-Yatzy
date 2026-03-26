import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMultiplayerGame } from '@/hooks/useMultiplayerGame';
import { DiceArea } from '@/components/game/DiceArea';
import { ScoreBoard } from '@/components/game/ScoreBoard';
import { ForfeitButton } from '@/components/game/ForfeitButton';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { setActiveGame, clearActiveGame } from '@/lib/active-game';
import { recordGameResult } from '@/lib/local-stats';
import { motion } from 'framer-motion';
import { Home } from 'lucide-react';

export default function MultiplayerGamePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    gameState, gameCode, status, myPlayerIndex, isMyTurn, error, localRolling,
    roll, toggleLock, getPossibleScores, selectCategory, rejoinGame, forfeitGame,
  } = useMultiplayerGame();

  const gameId = searchParams.get('gameId');
  const statsRecordedRef = useRef(false);
  const rejoinCalledRef = useRef<string | null>(null);

  useEffect(() => {
    if (gameId && !gameState && rejoinCalledRef.current !== gameId) {
      rejoinCalledRef.current = gameId;
      rejoinGame(gameId);
    }
  }, [gameId, gameState, rejoinGame]);

  // Track active game
  useEffect(() => {
    if (gameId && status === 'playing') {
      setActiveGame({ type: 'multiplayer', gameId, timestamp: Date.now() });
    }
    if (status === 'finished') {
      clearActiveGame();
    }
  }, [gameId, status]);

  // Handle game finished — record stats and navigate to results
  useEffect(() => {
    if (status === 'finished' && gameState && !statsRecordedRef.current) {
      statsRecordedRef.current = true;

      const results = gameState.players.map(p => ({
        name: p.name,
        score: getTotalScore(p.scores),
        scores: p.scores,
      }));

      // Record local stats for multiplayer
      if (myPlayerIndex !== null && myPlayerIndex >= 0) {
        const myScore = results[myPlayerIndex]?.score ?? 0;
        const topScore = Math.max(...results.map(r => r.score));
        const won = myScore === topScore && myScore > 0;
        recordGameResult(myScore, won);
      }

      navigate('/results', { state: { results, isMultiplayer: true } });
    }
  }, [status, gameState, myPlayerIndex, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-destructive font-semibold">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-display font-bold"
          >
            Tillbaka till menyn
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Laddar spel...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const possibleScores = isMyTurn && !localRolling ? getPossibleScores() : null;
  const canRoll = gameState.rollsLeft > 0 && isMyTurn;

  const PLAYER_COLORS = [
    { ring: 'ring-yatzy-player1', bg: 'bg-yatzy-player1', glow: 'shadow-[0_0_8px_hsl(36_82%_52%/0.5)]' },
    { ring: 'ring-yatzy-player2', bg: 'bg-yatzy-player2', glow: 'shadow-[0_0_8px_hsl(210_70%_52%/0.5)]' },
    { ring: 'ring-yatzy-player3', bg: 'bg-yatzy-player3', glow: 'shadow-[0_0_8px_hsl(155_60%_42%/0.5)]' },
    { ring: 'ring-yatzy-player4', bg: 'bg-yatzy-player4', glow: 'shadow-[0_0_8px_hsl(350_65%_52%/0.5)]' },
  ];

  const handleForfeit = async () => {
    if (statsRecordedRef.current) return;
    statsRecordedRef.current = true;

    try {
      // Record stats as loss
      if (myPlayerIndex !== null && myPlayerIndex >= 0) {
        const myScore = getTotalScore(gameState.players[myPlayerIndex]?.scores ?? {});
        recordGameResult(myScore, false);
      }

      await forfeitGame();
      clearActiveGame();

      const myName = myPlayerIndex !== null ? gameState.players[myPlayerIndex]?.name : 'Spelare';
      const results = gameState.players.map(p => ({
        name: p.name,
        score: getTotalScore(p.scores),
        scores: p.scores,
      }));
      navigate('/results', {
        state: {
          results,
          forfeit: true,
          forfeitPlayerName: myName,
          isMultiplayer: true,
        },
      });
    } catch (err) {
      console.error('Forfeit failed:', err);
      statsRecordedRef.current = false;
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 safe-top safe-bottom flex items-center justify-center">
      <motion.div
        className="flex flex-col gap-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {/* Game code */}
        {gameCode && (
          <p className="text-center text-[9px] text-muted-foreground/50 font-mono tracking-wider">
            Kod: {gameCode}
          </p>
        )}

        {/* Scoreboard + Players + Dice */}
        <div className="flex gap-6 items-stretch">
          <div className="game-shadow-soft rounded-lg overflow-hidden">
            <ScoreBoard
              players={gameState.players}
              currentPlayerIndex={gameState.currentPlayerIndex}
              possibleScores={possibleScores}
              onSelectCategory={selectCategory}
              rollsLeft={gameState.rollsLeft}
            />
          </div>

          <div className="flex flex-col gap-4">
            {/* Player indicators */}
            <div className="flex flex-col gap-2">
              {gameState.players.map((player, idx) => {
                const isCurrent = idx === gameState.currentPlayerIndex;
                const isMe = idx === myPlayerIndex;
                const color = PLAYER_COLORS[idx];
                return (
                  <motion.div
                    key={player.id}
                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all ${
                      isCurrent ? 'bg-secondary/80' : ''
                    }`}
                    animate={isCurrent ? { scale: 1.05 } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className={`w-5 h-5 rounded-full ${color.bg} ring-2 ring-offset-2 ring-offset-background ${
                      isCurrent ? `${color.ring} ${color.glow}` : 'ring-transparent'
                    } transition-all`} />
                    <span className={`text-[12px] font-semibold truncate max-w-[80px] ${
                      isCurrent ? 'text-foreground' : 'text-muted-foreground/50'
                    }`}>
                      {player.name}{isMe ? ' (du)' : ''}
                    </span>
                    {isCurrent && (
                      <motion.span
                        className="text-[9px] text-primary font-bold uppercase tracking-wider ml-auto"
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                      >
                        ●
                      </motion.span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Dice */}
            <DiceArea
              dice={gameState.dice}
              lockedDice={gameState.lockedDice}
              rollsLeft={gameState.rollsLeft}
              isRolling={localRolling || gameState.isRolling}
              onToggleLock={toggleLock}
            />
          </div>
        </div>

        {/* Roll count */}
        <p className="text-center text-[11px] text-muted-foreground/60 font-medium tabular-nums tracking-wide">
          {gameState.rollsLeft === 3
            ? '\u00A0'
            : gameState.rollsLeft === 0
              ? 'Välj en kategori på brickan'
              : `Kast ${3 - gameState.rollsLeft} / 3`}
        </p>

        {/* Home + Forfeit + Roll button row */}
        <div className="flex gap-3 items-stretch">
          <button
            onClick={() => navigate('/')}
            className="px-4 rounded-2xl bg-secondary hover:bg-secondary/80 transition-colors flex items-center justify-center"
            title="Till menyn"
          >
            <Home className="w-4 h-4 text-muted-foreground" />
          </button>
          <ForfeitButton
            onConfirm={handleForfeit}
            playerName={
              myPlayerIndex !== null && gameState.players.length > 1
                ? gameState.players.filter((_, i) => i !== myPlayerIndex).map(p => p.name).join(', ')
                : undefined
            }
          />
          <motion.button
            onClick={roll}
            disabled={!canRoll || gameState.isRolling}
            className={`flex-1 py-4 rounded-2xl font-display font-bold text-[15px] tracking-wide transition-all ${
              canRoll && !gameState.isRolling
                ? 'bg-gradient-to-b from-primary to-game-gold-dark text-primary-foreground shadow-[0_6px_28px_-4px_hsl(42_88%_52%/0.35),0_2px_8px_-2px_hsl(0_0%_0%/0.35)] active:scale-[0.97]'
                : 'bg-secondary text-muted-foreground shadow-none'
            }`}
            whileTap={canRoll ? { scale: 0.97 } : {}}
          >
            {!isMyTurn
              ? `Väntar på ${currentPlayer.name}...`
              : gameState.rollsLeft === 3
                ? 'Kasta'
                : gameState.rollsLeft === 0
                  ? 'Välj kategori'
                  : 'Kasta igen'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
