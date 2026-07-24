import { motion } from 'framer-motion';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface TurnIndicatorProps {
  currentPlayerName: string;
  isMyTurn: boolean;
  rollsLeft: number;
  isRolling?: boolean;
  isAi?: boolean;
  playerIndex?: number;
}

const PLAYER_COLORS = [
  '36 82% 52%', // P1 amber
  '210 70% 52%', // P2 blue
  '155 60% 42%', // P3 green
  '350 65% 52%', // P4 red
];

export function TurnIndicator({
  currentPlayerName,
  isMyTurn,
  rollsLeft,
  isRolling = false,
  isAi = false,
  playerIndex = 0,
}: TurnIndicatorProps) {
  const { t } = useTranslation();
  const hsl = PLAYER_COLORS[playerIndex] ?? PLAYER_COLORS[0];
  const rollsUsed = 3 - rollsLeft;

  const label = isMyTurn
    ? t('yourTurnLabel')
    : t('waitingForPlayer', { name: currentPlayerName });

  return (
    <motion.div
      className={cn(
        'relative flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 w-full',
        isMyTurn ? 'bg-primary/12' : 'bg-secondary/60'
      )}
      style={{
        boxShadow: isMyTurn
          ? `0 0 0 1px hsl(${hsl} / 0.45), 0 4px 16px -4px hsl(${hsl} / 0.25), inset 0 1px 0 rgba(255,255,255,0.06)`
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
      animate={isMyTurn && !isRolling ? { scale: [1, 1.02, 1] } : { scale: 1 }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Soft ambient glow behind the text when active */}
      {isMyTurn && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, hsl(${hsl} / 0.18), transparent 70%)`,
          }}
        />
      )}

      <div className="relative flex items-center gap-2">
        <span
          className={cn(
            'text-[13px] font-display font-bold leading-none',
            isMyTurn ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
        {isMyTurn && (
          <span className="relative flex h-2 w-2">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ backgroundColor: `hsl(${hsl})` }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: `hsl(${hsl})` }}
            />
          </span>
        )}
      </div>

      {isMyTurn && !isAi && (
        <div className="relative flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, i) => {
            const used = i < rollsUsed;
            return (
              <div
                key={i}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  used ? 'opacity-30' : 'opacity-100'
                )}
                style={{
                  backgroundColor: used ? `hsl(${hsl} / 0.35)` : `hsl(${hsl})`,
                  boxShadow: !used ? `0 0 6px hsl(${hsl} / 0.6)` : 'none',
                }}
              />
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
