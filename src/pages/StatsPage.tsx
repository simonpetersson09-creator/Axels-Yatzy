import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Trophy, Target, Hash, TrendingUp, Sparkles } from 'lucide-react';

const mockStats = {
  gamesPlayed: 0,
  wins: 0,
  highScore: 0,
  totalScore: 0,
  yatzyCount: 0,
};

const statItems = [
  { label: 'Matcher spelade', value: mockStats.gamesPlayed, icon: Hash },
  { label: 'Vinster', value: mockStats.wins, icon: Trophy },
  { label: 'Högsta poäng', value: mockStats.highScore, icon: Target },
  { label: 'Genomsnittspoäng', value: mockStats.gamesPlayed ? Math.round(mockStats.totalScore / mockStats.gamesPlayed) : 0, icon: TrendingUp },
  { label: 'Antal Yatzy', value: mockStats.yatzyCount, icon: Sparkles },
];

export default function StatsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-6 py-8 safe-top safe-bottom">
      <motion.div
        className="max-w-sm mx-auto space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-2xl font-display font-bold">Statistik</h1>
        </div>

        {/* Profile card */}
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-game-gold/15 flex items-center justify-center">
            <span className="text-2xl">👤</span>
          </div>
          <div>
            <p className="font-display font-bold text-lg">Gäst</p>
            <p className="text-sm text-muted-foreground">Logga in för att spara statistik</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="space-y-2">
          {statItems.map((item, i) => (
            <motion.div
              key={item.label}
              className="glass-card p-4 flex items-center justify-between"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-game-gold/10 flex items-center justify-center">
                  <item.icon className="w-4 h-4 text-game-gold" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
              </div>
              <span className="font-display font-bold text-lg">{item.value}</span>
            </motion.div>
          ))}
        </div>

        <motion.button
          onClick={() => navigate('/login')}
          className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold font-display"
          whileTap={{ scale: 0.97 }}
        >
          Logga in för att spara
        </motion.button>
      </motion.div>
    </div>
  );
}
