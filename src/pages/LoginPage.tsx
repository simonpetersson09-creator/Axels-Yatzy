import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement with backend auth
    navigate('/');
  };

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
          <h1 className="text-2xl font-display font-bold">Logga in</h1>
        </div>

        {/* Apple Sign In */}
        <motion.button
          className="w-full py-3.5 rounded-2xl bg-foreground text-background font-semibold flex items-center justify-center gap-2"
          whileTap={{ scale: 0.97 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Logga in med Apple
        </motion.button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">eller</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="E-postadress"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground border border-border/50 focus:border-game-gold/50 focus:outline-none focus:ring-1 focus:ring-game-gold/30"
            />
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Lösenord"
            className="w-full px-4 py-3 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground border border-border/50 focus:border-game-gold/50 focus:outline-none focus:ring-1 focus:ring-game-gold/30"
          />
          <motion.button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold font-display game-shadow"
            whileTap={{ scale: 0.97 }}
          >
            Logga in
          </motion.button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Inget konto?{' '}
          <button onClick={() => navigate('/register')} className="text-game-gold font-semibold">
            Skapa konto
          </button>
        </p>
      </motion.div>
    </div>
  );
}
