import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getActiveGame } from '@/lib/active-game';
import { Play } from 'lucide-react';

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

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
    <div className="min-h-screen flex flex-col items-center justify-center px-6 safe-top safe-bottom relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[120px]" />
      </div>

      {/* Subtle dice pattern background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.035,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Crect x='10' y='10' width='40' height='40' rx='8' fill='none' stroke='white' stroke-width='1.5'/%3E%3Ccircle cx='22' cy='22' r='3' fill='white'/%3E%3Ccircle cx='38' cy='22' r='3' fill='white'/%3E%3Ccircle cx='22' cy='38' r='3' fill='white'/%3E%3Ccircle cx='38' cy='38' r='3' fill='white'/%3E%3Ccircle cx='30' cy='30' r='3' fill='white'/%3E%3C/svg%3E")`,
          backgroundSize: '60px 60px',
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm"
        variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}
        initial="hidden"
        animate="show"
      >
        {/* Logo / Title */}
        <motion.div className="text-center space-y-2" variants={item} transition={{ duration: 0.45, ease: 'easeOut' }}>
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-4"
            animate={{
              rotate: [0, 0, 6, -4, 0],
              scale: [1, 1, 1.06, 1.02, 1],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              repeatDelay: 3,
              ease: 'easeInOut',
            }}
          >
            <span className="text-4xl">🎲</span>
          </motion.div>
          <h1
            className="text-5xl font-display font-black text-gold-gradient"
            style={{
              textShadow: '0 0 30px hsl(36 78% 55% / 0.15), 0 0 60px hsl(36 78% 55% / 0.08)',
            }}
          >
            Yatzy
          </h1>
          <p className="text-muted-foreground text-sm">
            Klassiskt tärningsspel i modern tappning
          </p>
        </motion.div>

        {/* Main Actions */}
        <div className="w-full space-y-3">
          {activeGame && (
            <motion.button
              onClick={resumeGame}
              className="w-full py-4 rounded-2xl bg-game-success text-white font-display font-bold text-lg shadow-lg flex items-center justify-center gap-2 active:shadow-md transition-shadow"
              whileTap={{ scale: 0.97 }}
              variants={item}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <Play className="w-5 h-5" />
              Fortsätt pågående match
            </motion.button>
          )}
          <motion.button
            onClick={() => navigate('/setup')}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg shadow-[0_4px_16px_hsl(36_78%_55%/0.3)] active:shadow-[0_2px_8px_hsl(36_78%_55%/0.2)] transition-shadow"
            whileTap={{ scale: 0.97 }}
            variants={item}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            🎲 Spela lokalt
          </motion.button>

          <motion.button
            onClick={() => navigate('/multiplayer')}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-game-info to-game-info/80 text-white font-display font-bold text-lg shadow-[0_4px_16px_hsl(200_65%_50%/0.3)] active:shadow-[0_2px_8px_hsl(200_65%_50%/0.2)] transition-shadow"
            whileTap={{ scale: 0.97 }}
            variants={item}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            🌐 Spela med vänner
          </motion.button>
        </div>

        {/* Secondary Actions */}
        <motion.div
          className="flex gap-6"
          variants={item}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <button
            onClick={() => navigate('/stats')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:scale-[0.97] transition-all"
          >
            <span className="text-base">📊</span>
            <span>Statistik</span>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:scale-[0.97] transition-all"
          >
            <span className="text-base">⚙️</span>
            <span>Inställningar</span>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
