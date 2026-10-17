import NotificationsOffBanner from '@/components/NotificationsOffBanner';
import { Dices } from 'lucide-react';
import { DiceInfoSheet } from '@/components/DiceInfoSheet';
import { DiceShop } from '@/components/DiceShop';
import { Button } from '@/components/ui/button';
import { useGoldStatus, ownProfile, goldDaysLeft, isGoldActive, setPreferWhiteDice } from '@/lib/gold-dice';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Camera, Trash2, Check, Bell, BellRing, Globe, BarChart3, ChevronRight } from 'lucide-react';
import {
  getProfileName, setProfileName,
  getProfileAvatar, setProfileAvatar,
  getLanguage, setLanguage,
  getProfileCountry, setProfileCountry,
  fileToAvatarDataUrl,
  LANGUAGES, COUNTRIES, type Language,
} from '@/lib/profile';
import { countryToFlag, countryName, syncCountryRank } from '@/lib/country-rank';
import { resetLocalStats, getLocalStats, saveLocalStats, type LocalStats } from '@/lib/local-stats';
import { t } from '@/lib/i18n';
import { getAnonNumber } from '@/lib/session';
import { trackEvent } from '@/lib/analytics';
import { isAdPrivacyOptionsRequired, showAdPrivacyOptions } from '@/lib/admob';
import { ShieldCheck } from 'lucide-react';
import { getNotificationPrefs, setNotificationPrefs } from '@/lib/notifications';
import { toast } from 'sonner';

export default function SettingsPage() {
  const navigate = useNavigate();
  const goldStatus = useGoldStatus();
  const [preferWhite, setPreferWhite] = useState(!!goldStatus.preferWhite);
  useEffect(() => { setPreferWhite(!!goldStatus.preferWhite); }, [goldStatus.preferWhite]);
  const [myDiceOpen, setMyDiceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(() => getProfileName());
  const [avatar, setAvatar] = useState<string | null>(() => getProfileAvatar());
  const [lang, setLang] = useState<Language>(() => getLanguage());
  const [country, setCountry] = useState<string | null>(() => getProfileCountry());
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [notifPrefs, setNotifPrefsState] = useState(() => getNotificationPrefs());
  const [, force] = useState(0);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [statsSnapshot, setStatsSnapshot] = useState<LocalStats>(() => getLocalStats());
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const updateNotifPref = (key: 'turnNotifications' | 'reminderNotifications', value: boolean) => {
    const next = { ...notifPrefs, [key]: value };
    setNotifPrefsState(next);
    void setNotificationPrefs(next);
  };

  // Re-render labels when language changes
  useEffect(() => { force(n => n + 1); }, [lang]);

  // Track settings opened (once per mount)
  useEffect(() => { trackEvent('settings_opened'); }, []);

  // "Annonsinställningar" visas bara där Google kräver det (EU/UK).
  const [adPrivacyRequired, setAdPrivacyRequired] = useState(false);
  useEffect(() => {
    let alive = true;
    void isAdPrivacyOptionsRequired().then((r) => { if (alive) setAdPrivacyRequired(r); });
    return () => { alive = false; };
  }, []);

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
      toast.error(t('errorGeneric'));
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
    trackEvent('language_changed', { language: l });
    toast.success(t('languageSaved'));
  };

  const changeCountry = (code: string | null) => {
    setProfileCountry(code);
    setCountry(code);
    setCountryPickerOpen(false);
    // Sync immediately so the home card reflects the new country on return.
    void syncCountryRank();
  };


  const resetStats = () => {
    if (!confirm(t('resetStatsConfirm'))) return;
    resetLocalStats();
    setStatsSnapshot(getLocalStats());
    toast.success(t('resetDone'));
  };

  // Hidden manual correction: tap the "Statistics" heading 5 times.
  const handleStatsTitleTap = () => {
    if (adjustOpen) return;
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 1500);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setStatsSnapshot(getLocalStats());
      setAdjustOpen(true);
      toast.success('Manuell justering aktiverad');
    }
  };

  const adjustStat = (key: 'wins' | 'gamesPlayed', delta: number) => {
    const current = getLocalStats();
    const next = { ...current, [key]: Math.max(0, current[key] + delta) };
    if (next.wins > next.gamesPlayed) next.gamesPlayed = next.wins;
    saveLocalStats(next);
    setStatsSnapshot(next);
  };


  const displayName = name.trim() || t('playerN', { n: getAnonNumber() });

  return (
    <div
      className="overflow-y-auto overscroll-contain px-5 pt-6"
      style={{
        height: 'var(--app-dvh, 100dvh)',
        maxHeight: 'var(--app-dvh, 100dvh)',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        paddingTop: 'calc(24px + env(safe-area-inset-top))',
        paddingBottom: 'calc(40px + env(safe-area-inset-bottom))',
      }}
    >
      <motion.div
        className="max-w-sm mx-auto space-y-4 mt-3"
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
          <div className="rounded-2xl bg-secondary/50 border border-border/40 p-3 flex items-center gap-3 game-shadow-soft">
            <motion.button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-14 h-14 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-primary/30 to-primary/10 ring-2 ring-primary/30 ring-offset-2 ring-offset-background flex items-center justify-center group"
              whileTap={{ scale: 0.94 }}
              whileHover={{ scale: 1.03 }}
            >
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-primary/70" />
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

            <div className="flex-1 min-w-0">
              <p className="text-sm font-display font-semibold text-foreground break-words">{displayName}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
              <motion.button
                onClick={() => fileInputRef.current?.click()}
                className="min-h-9 px-2.5 py-1.5 rounded-full bg-primary/15 text-primary text-xs font-semibold active:bg-primary/25 transition-colors"
                whileTap={{ scale: 0.94 }}
              >
                {t('changeAvatar')}
              </motion.button>
              {avatar && (
                <motion.button
                  onClick={removeAvatar}
                  className="min-h-9 px-2.5 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold active:bg-destructive/20 transition-colors"
                  whileTap={{ scale: 0.94 }}
                >
                  {t('removeAvatar')}
                </motion.button>
              )}
              </div>
            </div>
          </div>

          {/* Name row */}
          <Card>
            {editingName ? (
              <div className="px-3 py-2.5 flex items-center gap-3">
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




        <Section title={t('myDice')}>
          <Card>
            <Button variant="ghost"
              onClick={() => { setMyDiceOpen(true); trackEvent('my_dice_opened', { from: 'settings' }); }}
              className="h-auto min-h-11 w-full justify-start px-3 py-2.5 text-left border-b border-border/40"
            >
              <Dices className="w-4 h-4 text-primary" />
              <span className="flex-1 text-sm font-medium text-foreground">{t('myDice')}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Button>
            {(goldStatus.tier !== 'white' || isGoldActive(goldStatus)) && (
              <div className="border-b border-border/40">
                <ToggleRow
                  icon={<Dices className="w-4 h-4 text-muted-foreground" />}
                  label={t('useWhiteDice')}
                  description={t('useWhiteDiceDesc')}
                  value={preferWhite}
                  onChange={async (v) => {
                    setPreferWhite(v);
                    trackEvent('white_dice_toggled', { on: v });
                    const ok = await setPreferWhiteDice(v);
                    if (!ok) { setPreferWhite(!v); toast.error(t('errorGeneric')); }
                  }}
                />
              </div>
            )}
            <DiceInfoSheet
              open={myDiceOpen}
              onClose={() => setMyDiceOpen(false)}
              name={t('myDice')}
              profile={ownProfile(goldStatus)}
              inviteDaysLeft={goldDaysLeft(goldStatus) || undefined}
              showLadder
              avatarUrl={avatar}
              footer={<DiceShop ownedOnly />}
            />
          </Card>
        </Section>

        <Section title={t('statistics')} onTitleTap={handleStatsTitleTap}>
          <Card>
            {adjustOpen && (
              <>
                <div className="px-3 py-2.5 space-y-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Justera statistik
                  </p>
                  <AdjustRow
                    label="Vinster"
                    value={statsSnapshot.wins}
                    onChange={(d) => adjustStat('wins', d)}
                  />
                  <AdjustRow
                    label="Spelade"
                    value={statsSnapshot.gamesPlayed}
                    onChange={(d) => adjustStat('gamesPlayed', d)}
                  />
                </div>
                <div className="border-t border-border/40" />
              </>
            )}
            <motion.button
              onClick={() => navigate('/stats')}
              className="w-full min-h-11 px-3 py-2.5 flex items-center gap-3 text-left active:bg-secondary/60 transition-colors border-b border-border/40"
              whileTap={{ scale: 0.985 }}
            >
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="flex-1 text-sm font-medium text-foreground">{t('statsPage')}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </motion.button>
          </Card>
        </Section>


        {/* Country */}
        <Section title={t('countrySection')}>
          <Card>
            <button
              type="button"
              onClick={() => setCountryPickerOpen(o => !o)}
              className="w-full min-h-11 px-3 py-2.5 flex items-center gap-3 text-left active:bg-secondary/60 transition-colors"
            >
              <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t('countryLabel')}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {country
                    ? `${countryToFlag(country)} ${countryName(country, lang)}`
                    : t('countryNotSet')}
                </p>
              </div>
            </button>
            <AnimatePresence>
              {countryPickerOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border/40 overflow-hidden"
                >
                  <div className="max-h-72 overflow-y-auto overscroll-contain">
                    {country && (
                      <motion.button
                        onClick={() => changeCountry(null)}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left active:bg-destructive/10 transition-colors border-b border-border/40"
                        whileTap={{ scale: 0.985 }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                        <span className="text-sm font-medium text-destructive">{t('countryClear')}</span>
                      </motion.button>
                    )}
                    {[...COUNTRIES]
                      .map(c => ({ code: c, name: countryName(c, lang) }))
                      .sort((a, b) => a.name.localeCompare(b.name, lang))
                      .map(({ code, name }, idx) => (
                        <motion.button
                          key={code}
                          onClick={() => changeCountry(code)}
                          className={`w-full px-4 py-3 flex items-center gap-3 text-left active:bg-secondary/60 transition-colors ${
                            idx > 0 ? 'border-t border-border/40' : ''
                          }`}
                          whileTap={{ scale: 0.985 }}
                        >
                          <span className="text-xl leading-none">{countryToFlag(code)}</span>
                          <span className="flex-1 text-sm font-medium">{name}</span>
                          {country === code && (
                            <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
                            </span>
                          )}
                        </motion.button>
                      ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </Section>



        {/* Notifications */}
        <Section title={t('notifications')}>
          <NotificationsOffBanner className="mb-2" />
          <Card>
            <ToggleRow
              icon={<Bell className="w-4 h-4 text-primary" />}
              label={t('notifTurnLabel')}
              description={t('notifTurnDesc')}
              value={notifPrefs.turnNotifications}
              onChange={(v) => updateNotifPref('turnNotifications', v)}
            />
            <div className="border-t border-border/40" />
            <ToggleRow
              icon={<BellRing className="w-4 h-4 text-primary" />}
              label={t('notifReminderLabel')}
              description={t('notifReminderDesc')}
              value={notifPrefs.reminderNotifications}
              onChange={(v) => updateNotifPref('reminderNotifications', v)}
            />
          </Card>
        </Section>


        <Card>
            <motion.button
              onClick={resetStats}
              className="w-full min-h-11 px-3 py-2.5 flex items-center gap-3 text-left active:bg-destructive/10 transition-colors"
              whileTap={{ scale: 0.985 }}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">{t('resetStats')}</span>
            </motion.button>
        </Card>

        {adPrivacyRequired && (
          <Card>
            <motion.button
              onClick={() => { trackEvent('ad_privacy_opened'); void showAdPrivacyOptions(); }}
              className="w-full min-h-11 px-3 py-2.5 flex items-center gap-3 text-left active:bg-secondary/60 transition-colors"
              whileTap={{ scale: 0.985 }}
            >
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="flex-1 text-sm font-medium text-foreground">{t('adPrivacy')}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </motion.button>
          </Card>
        )}

        <div className="text-center pt-2 pb-6">
          <p className="text-[11px] text-muted-foreground/60">{t('version')} 1.0</p>
        </div>
      </motion.div>
    </div>
  );
}

function Section({ title, children, onTitleTap }: { title: string; children: React.ReactNode; onTitleTap?: () => void }) {
  return (
    <div className="space-y-1.5">
      <p
        onClick={onTitleTap}
        className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-[0.12em] px-2 select-none"
      >
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function AdjustRow({ label, value, onChange }: { label: string; value: number; onChange: (delta: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(-1)}
          className="w-8 h-8 rounded-full bg-secondary border border-border/60 text-foreground text-lg leading-none active:opacity-70"
        >
          −
        </button>
        <span className="min-w-[2ch] text-center font-display font-bold tabular-nums text-foreground">{value}</span>
        <button
          onClick={() => onChange(1)}
          className="w-8 h-8 rounded-full bg-secondary border border-border/60 text-foreground text-lg leading-none active:opacity-70"
        >
          +
        </button>
      </div>
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
      className="w-full min-h-11 px-3 py-2.5 flex items-center gap-3 text-left active:bg-secondary/60 transition-colors"
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

function ToggleRow({
  icon, label, description, value, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full min-h-11 px-3 py-2.5 flex items-center gap-3 text-left active:bg-secondary/60 transition-colors"
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground/80 truncate">{description}</p>}
      </div>
      <span
        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
          value ? 'bg-primary' : 'bg-secondary border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}
