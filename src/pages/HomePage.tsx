import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getActiveGame } from '@/lib/active-game';
import { Play } from 'lucide-react';

export default function HomePage() {
  const navigate = useNavigate();
  const activeGame = getActiveGame();

  const resumeGame = () => {
    if (!activeGame) return;
    if (activeGame.type === 'local') {
      navigate('/game');
    } else if (activeGame.type === 'multiplayer' && activeGame.gameId) {
      navigate(`/multiplayer-game?gameId=${activeGame.gameId}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 safe-top safe-bottom">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-game-gold/5 blur-[100px]" />
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-game-gold/10 border border-game-gold/20 mb-4"
            initial={{ scale: 0.5, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <span className="text-4xl">🎲</span>
          </motion.div>
          <h1 className="text-5xl font-display font-black text-gold-gradient">
            Yatzy
          </h1>
          <p className="text-muted-foreground text-sm">
            Klassiskt tärningsspel i modern tappning
          </p>
        </div>

        {/* Main Actions */}
        <div className="w-full space-y-3">
          {activeGame && (
            <motion.button
              onClick={resumeGame}
              className="w-full py-4 rounded-2xl bg-game-success text-white font-display font-bold text-lg shadow-lg flex items-center justify-center gap-2"
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Play className="w-5 h-5" />
              Fortsätt pågående match
            </motion.button>
          )}
          <motion.button
            onClick={() => navigate('/setup')}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow"
            whileTap={{ scale: 0.97 }}
          >
            🎲 Spela lokalt
          </motion.button>

          <motion.button
            onClick={() => navigate('/multiplayer')}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-game-info to-game-info/80 text-white font-display font-bold text-lg shadow-lg"
            whileTap={{ scale: 0.97 }}
          >
            🌐 Spela med vänner
          </motion.button>

          <motion.button
            onClick={() => navigate('/login')}
            className="w-full py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-semibold"
            whileTap={{ scale: 0.97 }}
          >
            Logga in
          </motion.button>

          <motion.button
            onClick={() => navigate('/register')}
            className="w-full py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-semibold"
            whileTap={{ scale: 0.97 }}
          >
            Skapa konto
          </motion.button>
        </div>

        {/* Secondary Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/stats')}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            📊 Statistik
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ⚙️ Inställningar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
