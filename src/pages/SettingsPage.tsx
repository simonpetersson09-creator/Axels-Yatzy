import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Camera, Trash2, Check } from 'lucide-react';
import {
  getProfileName, setProfileName,
  getProfileAvatar, setProfileAvatar,
  getLanguage, setLanguage,
  fileToAvatarDataUrl,
  LANGUAGES, type Language,
} from '@/lib/profile';
import { saveLocalStats } from '@/lib/local-stats';
import { t } from '@/lib/i18n';
import { toast } from 'sonner';

export default function SettingsPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(() => getProfileName());
  const [avatar, setAvatar] = useState<string | null>(() => getProfileAvatar());
  const [lang, setLang] = useState<Language>(() => getLanguage());
  const [editingName, setEditingName] = useState(false);
  const [, force] = useState(0);

  // Re-render labels when language changes
  useEffect(() => { force(n => n + 1); }, [lang]);

  const saveName = () => {
    setProfileName(name);
    setEditingName(false);
    toast.success(t('nameSaved'));
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setProfileAvatar(dataUrl);
      setAvatar(dataUrl);
      toast.success(t('avatarSaved'));
    } catch {
      toast.error('Error');
    }
  };

  const removeAvatar = () => {
    setProfileAvatar(null);
    setAvatar(null);
    toast.success(t('avatarRemoved'));
  };

  const changeLang = (l: Language) => {
    setLanguage(l);
    setLang(l);
    toast.success(t('languageSaved'));
  };

  const resetStats = () => {
    if (!confirm(t('resetStatsConfirm'))) return;
    saveLocalStats({ gamesPlayed: 0, wins: 0, highScore: 0 });
    toast.success(t('resetDone'));
  };

  const displayName = name.trim() || t('guest');

  return (
    <div className="min-h-[100dvh] px-5 py-6 pt-[calc(1.5rem+30px)] safe-top safe-bottom">
      <motion.div
        className="max-w-sm mx-auto space-y-7"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <motion.button
            onClick={() => navigate('/')}
            className="p-2.5 -ml-2 rounded-xl active:bg-secondary/80 transition-colors"
            whileTap={{ scale: 0.92 }}
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </motion.button>
          <h1 className="text-2xl font-display font-bold">{t('settings')}</h1>
        </div>

        {/* Profile card with big avatar */}
        <Section title={t('profile')}>
          <div className="rounded-3xl bg-secondary/50 border border-border/40 p-5 flex flex-col items-center gap-4 game-shadow-soft">
            <motion.button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-primary/30 to-primary/10 ring-2 ring-primary/30 ring-offset-4 ring-offset-background flex items-center justify-center group"
              whileTap={{ scale: 0.94 }}
              whileHover={{ scale: 1.03 }}
            >
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-primary/70" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </motion.button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarPick}
            />

            <div className="flex gap-2">
              <motion.button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-full bg-primary/15 text-primary text-xs font-semibold active:bg-primary/25 transition-colors"
                whileTap={{ scale: 0.94 }}
              >
                {t('changeAvatar')}
              </motion.button>
              {avatar && (
                <motion.button
                  onClick={removeAvatar}
                  className="px-4 py-2 rounded-full bg-destructive/10 text-destructive text-xs font-semibold active:bg-destructive/20 transition-colors"
                  whileTap={{ scale: 0.94 }}
                >
                  {t('removeAvatar')}
                </motion.button>
              )}
            </div>

            <p className="text-base font-display font-semibold text-foreground">{displayName}</p>
          </div>

          {/* Name row */}
          <Card>
            {editingName ? (
              <div className="px-4 py-3.5 flex items-center gap-3">
                <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  placeholder={t('enterName')}
                  maxLength={20}
                  autoFocus
                  className="flex-1 bg-transparent text-sm font-medium border-b border-primary/40 focus:border-primary focus:outline-none py-1 transition-colors"
                />
                <motion.button
                  onClick={saveName}
                  className="p-1.5 rounded-lg bg-primary/15 active:bg-primary/25 transition-colors"
                  whileTap={{ scale: 0.92 }}
                >
                  <Check className="w-4 h-4 text-primary" />
                </motion.button>
              </div>
            ) : (
              <Row
                icon={<User className="w-4 h-4 text-muted-foreground" />}
                label={t('playerName')}
                value={displayName}
                onClick={() => setEditingName(true)}
              />
            )}
          </Card>
        </Section>

        {/* Language */}
        <Section title={t('language')}>
          <Card>
            {LANGUAGES.map((l, idx) => (
              <motion.button
                key={l.code}
                onClick={() => changeLang(l.code)}
                className={`w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-secondary/60 transition-colors ${
                  idx > 0 ? 'border-t border-border/40' : ''
                }`}
                whileTap={{ scale: 0.985 }}
              >
                <span className="text-xl leading-none">{l.flag}</span>
                <span className="flex-1 text-sm font-medium">{l.label}</span>
                <AnimatePresence>
                  {lang === l.code && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                    >
                      <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </Card>
        </Section>

        {/* Stats */}
        <Section title={t('statistics')}>
          <Card>
            <motion.button
              onClick={resetStats}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-destructive/10 transition-colors"
              whileTap={{ scale: 0.985 }}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">{t('resetStats')}</span>
            </motion.button>
          </Card>
        </Section>

        <div className="text-center pt-2 pb-6">
          <p className="text-[11px] text-muted-foreground/60">{t('version')} 1.0</p>
        </div>
      </motion.div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-[0.12em] px-2">
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-secondary/50 border border-border/40 overflow-hidden game-shadow-soft">
      {children}
    </div>
  );
}

function Row({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value?: string; onClick?: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-secondary/60 transition-colors"
      whileTap={{ scale: 0.985 }}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {value && <p className="text-xs text-muted-foreground truncate">{value}</p>}
      </div>
    </motion.button>
  );
}
