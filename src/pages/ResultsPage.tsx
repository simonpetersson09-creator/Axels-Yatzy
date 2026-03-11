import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';

interface PlayerResult {
  name: string;
  score: number;
}

export default function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const results: PlayerResult[] = location.state?.results || [];

  const sorted = [...results].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 safe-top safe-bottom">
      <motion.div
        className="w-full max-w-sm space-y-8 text-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Winner */}
        <div className="space-y-3">
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-game-gold/15 border border-game-gold/30"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <Trophy className="w-10 h-10 text-game-gold" />
          </motion.div>
          <h1 className="text-3xl font-display font-black text-gold-gradient">
            {results.length > 1 ? `${winner?.name} vinner!` : 'Spelet slut!'}
          </h1>
        </div>

        {/* Scores */}
        <div className="space-y-2">
          {sorted.map((player, i) => (
            <motion.div
              key={player.name}
              className={`glass-card p-4 flex items-center justify-between ${
                i === 0 ? 'ring-1 ring-game-gold/30' : ''
              }`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i === 0 ? 'bg-game-gold text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </span>
                <span className="font-semibold">{player.name}</span>
              </div>
              <span className={`font-display font-bold text-xl ${
                i === 0 ? 'text-game-gold' : 'text-foreground'
              }`}>
                {player.score}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <motion.button
            onClick={() => navigate('/setup')}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow"
            whileTap={{ scale: 0.97 }}
          >
            Spela igen
          </motion.button>
          <motion.button
            onClick={() => navigate('/')}
            className="w-full py-3.5 rounded-2xl bg-secondary text-secondary-foreground font-semibold"
            whileTap={{ scale: 0.97 }}
          >
            Till startsidan
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
