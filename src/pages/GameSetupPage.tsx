import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { getPlayerName } from '@/lib/session';

export default function GameSetupPage() {
  const navigate = useNavigate();
  const [playerCount, setPlayerCount] = useState(1);
  const savedName = getPlayerName();
  const [names, setNames] = useState([savedName || 'Spelare 1', 'Spelare 2', 'Spelare 3', 'Spelare 4']);

  const updateName = (index: number, name: string) => {
    const updated = [...names];
    updated[index] = name;
    setNames(updated);
  };

  const startGame = () => {
    const playerNames = names.slice(0, playerCount).map((n, i) => n.trim() || `Spelare ${i + 1}`);
    // Only P1 is human. P2/P3/P4 are AI-controlled.
    const aiPlayers = playerNames.map((_, i) => i).filter(i => i !== 0);
    navigate('/game', { state: { playerNames, aiPlayers } });
  };

  return (
    <div className="app-screen px-6 py-8 safe-top safe-bottom overflow-y-auto overscroll-contain">
      <motion.div
        className="max-w-sm mx-auto space-y-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-2xl font-display font-bold">Nytt spel</h1>
        </div>

        {/* Player count */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Antal spelare
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(n => (
              <motion.button
                key={n}
                onClick={() => setPlayerCount(n)}
                className={`flex-1 py-3 rounded-xl font-display font-bold text-lg transition-all ${
                  playerCount === n
                    ? 'bg-primary text-primary-foreground game-shadow'
                    : 'bg-secondary text-secondary-foreground'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                {n}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Player names */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Spelarnamn
          </label>
          <div className="space-y-2">
            {Array.from({ length: playerCount }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <input
                  type="text"
                  value={names[i]}
                  onChange={e => updateName(i, e.target.value)}
                  placeholder={`Spelare ${i + 1}`}
                  className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground font-medium border border-border/50 focus:border-game-gold/50 focus:outline-none focus:ring-1 focus:ring-game-gold/30 transition-all"
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Start button */}
        <motion.button
          onClick={startGame}
          className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg game-shadow"
          whileTap={{ scale: 0.97 }}
        >
          Starta spel
        </motion.button>
      </motion.div>
    </div>
  );
}
