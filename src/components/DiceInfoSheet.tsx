import { createPortal } from 'react-dom';
import { Check, X, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { friendRequestExists, sendFriendRequest } from '@/lib/friend-requests';
import { motion } from 'framer-motion';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { nextTier, TIER_GOALS, SKIN_RANK, type DiceSkin } from '@/lib/dice-skin';
import { profileSkin, type DiceProfile, type PlayerStats } from '@/lib/gold-dice';
import { cn } from '@/lib/utils';
import { useBackHandler } from '@/lib/back-handler';

export const TIER_NAME: Record<DiceSkin, TranslationKey> = {
  white: 'tierWhite', bronze: 'tierBronze', silver: 'tierSilver', gold: 'tierGold',
};

export const SKIN_SWATCH: Record<DiceSkin, string> = {
  white: 'bg-foreground/90 border-border',
  bronze: 'bg-gradient-to-br from-dice-bronze-light to-dice-bronze-dark border-dice-bronze-dark',
  silver: 'bg-gradient-to-br from-dice-silver-light to-dice-silver-dark border-dice-silver-dark',
  gold: 'bg-gradient-to-br from-game-gold-light via-primary to-game-gold-dark border-game-gold',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Silver · 78/200 till guld" or "Guld · 214 matcher med Yatzy". */
export function useTierLine() {
  const { t } = useTranslation();
  return (p: DiceProfile) => {
    const next = nextTier(p.yatzyMatches);
    if (!next) return t('dicePermGold', { n: p.yatzyMatches });
    return t('diceTierLine', {
      tier: cap(t(TIER_NAME[p.tier])), n: p.yatzyMatches, goal: next.goal, next: t(TIER_NAME[next.tier]),
    });
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  name: string;
  profile: DiceProfile | undefined;
  /** Own sheet only: days of invite gold left. */
  inviteDaysLeft?: number;
  /** Show all levels (own "My dice" view). */
  showLadder?: boolean;
  /** Online: public match stats for this player. */
  stats?: PlayerStats;
  /** Profile picture (only known for the own player; stored on the phone). */
  avatarUrl?: string | null;
  /** Online opponent: show "Add friend" (one request per pair). */
  friendTarget?: { gameId: string; index: number } | null;
}

/** Small bottom sheet with a player's dice level. Never pauses the game. */
export function DiceInfoSheet({ open, onClose, name, profile, inviteDaysLeft, showLadder, stats, avatarUrl, friendTarget }: Props) {
  const { t } = useTranslation();
  const tierLine = useTierLine();
  useBackHandler(open && !!profile, onClose);
  const [friendState, setFriendState] = useState<'unknown' | 'can' | 'sending' | 'sent'>('unknown');
  const targetKey = friendTarget ? `${friendTarget.gameId}:${friendTarget.index}` : '';
  useEffect(() => {
    if (!open || !friendTarget) return;
    let alive = true;
    setFriendState('unknown');
    friendRequestExists(friendTarget.gameId, friendTarget.index)
      .then((e) => { if (alive) setFriendState(e ? 'sent' : 'can'); }, () => { if (alive) setFriendState('can'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetKey]);
  const addFriend = async () => {
    if (!friendTarget || friendState !== 'can') return;
    setFriendState('sending');
    const r = await sendFriendRequest(friendTarget.gameId, friendTarget.index);
    if (r === 'error') { setFriendState('can'); toast.error(t('errGeneric')); return; }
    setFriendState('sent');
    if (r === 'sent') toast.success(t('friendRequestSent'));
  };
  if (!open || !profile) return null;
  const skin = profileSkin(profile);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-background/50" onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="relative w-full max-w-md rounded-t-2xl bg-card border border-border px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} aria-label="OK" className="absolute top-3 right-3 text-muted-foreground p-1">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <div className="relative w-10 h-10 shrink-0">
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-border" />
              <div className={cn('absolute -bottom-1 -right-1 w-4 h-4 rounded-md border-2 border-card', SKIN_SWATCH[skin])} aria-hidden />
            </div>
          ) : (
            <div className={cn('w-10 h-10 rounded-xl border shrink-0', SKIN_SWATCH[skin])} aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{name}</p>
            {profile.isBot ? (
              <p className="text-xs text-muted-foreground">{t('diceComputer')}</p>
            ) : (
              <>
                {profile.inviteGold && profile.tier !== 'gold' && (
                  <p className="text-xs font-semibold text-game-gold">
                    {inviteDaysLeft ? t('diceInviteGoldDays', { d: inviteDaysLeft }) : t('diceInviteGold')}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{tierLine(profile)}</p>
              </>
            )}
          </div>
        </div>

        {stats && !profile.isBot && stats.worldRank != null && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">🌍 {t('worldRanking')}</span>
            <span className="text-base font-bold text-game-gold leading-none">#{stats.worldRank}</span>
          </div>
        )}
        {stats && !profile.isBot && (
          <div className={cn('grid grid-cols-4 gap-2 text-center', stats.worldRank != null ? 'mt-2' : 'mt-4')}>
            {[
              { label: t('statMatches'), value: String(stats.matches) },
              { label: t('statAvg'), value: stats.avgScore != null ? String(stats.avgScore) : '–' },
              { label: t('statBest'), value: stats.bestScore != null ? String(stats.bestScore) : '–' },
              { label: t('statOnlineWins'), value: stats.onlineMatches ? `${Math.round((stats.onlineWins / stats.onlineMatches) * 100)} %` : '–' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-muted/40 px-1 py-2">
                <p className="text-base font-bold text-foreground leading-none">{s.value}</p>
                <p className="mt-1 text-[10px] text-muted-foreground leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {friendTarget && !profile.isBot && friendState !== 'unknown' && (
          <button
            onClick={addFriend}
            disabled={friendState !== 'can'}
            className={cn('mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold active:scale-[0.98] transition',
              friendState === 'can' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground')}
          >
            {friendState === 'sent' ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {friendState === 'sent' ? t('friendRequestSent') : t('addFriendBtn')}
          </button>
        )}

        {showLadder && !profile.isBot && (
          <ul className="mt-4 space-y-2">
            {(['white', ...TIER_GOALS.map((g) => g.tier)] as DiceSkin[]).map((tier) => {
              const goal = TIER_GOALS.find((g) => g.tier === tier)?.goal ?? 0;
              const reached = SKIN_RANK[profile.tier] >= SKIN_RANK[tier];
              return (
                <li key={tier} className="flex items-center gap-3">
                  <div className={cn('w-6 h-6 rounded-md border shrink-0', SKIN_SWATCH[tier], !reached && 'opacity-40')} aria-hidden />
                  <span className={cn('text-sm flex-1', reached ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                    {cap(t(TIER_NAME[tier]))}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {goal ? t('diceLadderGoal', { goal }) : ''}
                  </span>
                  {reached && <Check className="w-4 h-4 text-primary" />}
                </li>
              );
            })}
          </ul>
        )}
        {showLadder && !profile.isBot && (
          <p className="mt-4 text-[11px] text-muted-foreground">{t('diceVisibleToOthers')}</p>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
