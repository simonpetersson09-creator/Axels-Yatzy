import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Flag } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface PlayerResult {
  name: string;
  score: number;
}

export default function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const results: PlayerResult[] = location.state?.results || [];
  const forfeit: boolean = location.state?.forfeit || false;
  const forfeitPlayerName: string = location.state?.forfeitPlayerName || '';
  const aiPlayers: number[] = location.state?.aiPlayers || [];
  const isMultiplayer: boolean = location.state?.isMultiplayer || false;
  const playerNames: string[] = results.map(r => r.name);

  const sorted = [...results].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  const forfeitWinner = forfeit && results.length > 1
    ? [...results].filter(r => r.name !== forfeitPlayerName).sort((a, b) => b.score - a.score)[0] ?? null
    : null;

  return (
    <div className="app-screen flex flex-col items-center justify-center px-6 safe-top safe-bottom overflow-y-auto overscroll-contain">
      <motion.div
        className="w-full max-w-sm space-y-8 text-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="space-y-3">
          <motion.div
            className={`inline-flex items-center justify-center w-20 h-20 rounded-full border ${
              forfeit ? 'bg-destructive/15 border-destructive/30' : 'bg-game-gold/15 border-game-gold/30'
            }`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            {forfeit ? (
              <Flag className="w-10 h-10 text-destructive" />
            ) : (
              <Trophy className="w-10 h-10 text-game-gold" />
            )}
          </motion.div>

          {forfeit ? (
            <>
              <h1 className="text-2xl font-display font-black text-foreground">
                {t('matchEnded')}
              </h1>
              <p className="text-muted-foreground text-sm">
                {forfeitPlayerName} {t('forfeited')}
              </p>
              {forfeitWinner && (
                <p className="text-lg font-display font-bold text-gold-gradient">
                  {t('playerWonBang', { name: forfeitWinner.name })} 🎲
                </p>
              )}
            </>
          ) : (
            <h1 className="text-3xl font-display font-black text-gold-gradient">
              {results.length > 1 ? t('playerWins', { name: winner?.name ?? '' }) : t('gameOver')}
            </h1>
          )}
        </div>

        <div className="space-y-2">
          {sorted.map((player, i) => (
            <motion.div
              key={`${player.name}-${i}`}
              className={`glass-card p-4 flex items-center justify-between ${
                i === 0 && !forfeit ? 'ring-1 ring-game-gold/30' : ''
              } ${forfeit && player.name === forfeitPlayerName ? 'opacity-50' : ''}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  i === 0 && !forfeit ? 'bg-game-gold text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </span>
                <span className="font-semibold truncate">{player.name}</span>
                {forfeit && player.name === forfeitPlayerName && (
                  <span className="text-[10px] text-destructive font-medium uppercase tracking-wider flex-shrink-0">{t('forfeitedTag')}</span>
                )}
              </div>
              <span className={`font-display font-bold text-xl flex-shrink-0 ml-2 ${
                i === 0 && !forfeit ? 'text-game-gold' : 'text-foreground'
              }`}>
                {player.score}
              </span>
            </motion.div>
          ))}
        </div>

        <div className="space-y-3">
          <motion.button
            onClick={() => isMultiplayer ? navigate('/multiplayer') : navigate('/game', { state: { playerNames, aiPlayers } })}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow"
            whileTap={{ scale: 0.97 }}
          >
            {isMultiplayer ? t('newMatch') : t('rematch')}
          </motion.button>
          <motion.button
            onClick={() => navigate('/setup')}
            className="w-full py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-semibold"
            whileTap={{ scale: 0.97 }}
          >
            {t('playAgain')}
          </motion.button>
          <motion.button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-2xl text-muted-foreground font-medium text-sm"
            whileTap={{ scale: 0.97 }}
          >
            {t('toHome')}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
