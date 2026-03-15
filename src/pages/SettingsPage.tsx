import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, User, LogOut, Trash2, Check } from 'lucide-react';
import { getPlayerName, setPlayerName } from '@/lib/session';
import { toast } from 'sonner';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => getPlayerName());
  const [editing, setEditing] = useState(false);

  const saveName = () => {
    setPlayerName(name);
    setEditing(false);
    toast.success('Spelnamn sparat!');
  };

  const displayName = getPlayerName() || 'Gäst';

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
          <h1 className="text-2xl font-display font-bold">Inställningar</h1>
        </div>

        {/* Profile */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Profil</p>
          <div className="glass-card divide-y divide-border/50">
            {editing ? (
              <div className="px-4 py-3 flex items-center gap-3">
                <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  placeholder="Ange ditt spelnamn"
                  maxLength={20}
                  autoFocus
                  className="flex-1 bg-transparent text-sm font-medium border-b border-primary/40 focus:border-primary focus:outline-none py-1 transition-colors"
                />
                <button
                  onClick={saveName}
                  className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <Check className="w-4 h-4 text-primary" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
              >
                <User className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Spelarnamn</p>
                  <p className="text-xs text-muted-foreground">{displayName}</p>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Account */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Konto</p>
          <div className="glass-card divide-y divide-border/50">
            <button
              onClick={() => navigate('/login')}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Logga in</span>
            </button>
            <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left">
              <Trash2 className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">Radera statistik</span>
            </button>
          </div>
        </div>

        <div className="text-center pt-4">
          <p className="text-xs text-muted-foreground">Yatzy v1.0</p>
        </div>
      </motion.div>
    </div>
  );
}
