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
  placement?: 'top' | 'left';
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
  placement = 'top',
}: TurnIndicatorProps) {
  const { t } = useTranslation();
  const hsl = PLAYER_COLORS[playerIndex] ?? PLAYER_COLORS[0];
  const rollsUsed = 3 - rollsLeft;

  const label = isMyTurn
    ? t('yourTurnLabel')
    : t('waitingForPlayer', { name: currentPlayerName });

  const isLeft = placement === 'left';

  const wrapperStyle: React.CSSProperties = isLeft
    ? { right: 'calc(100% + 10px)', top: '50%', transform: 'translateY(calc(-50% - 16px))' }
    : { bottom: 'calc(100% + 8px)' };

  return (
    <motion.div
      className={cn(
        'absolute z-10 flex items-center pointer-events-none',
        isLeft ? 'flex-row' : 'flex-col left-1/2 -translate-x-1/2'
      )}
      style={wrapperStyle}
      initial={{ opacity: 0, y: isLeft ? 0 : 8, x: isLeft ? 8 : 0, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
    >
      {/* Bubble */}
      <div
        className={cn(
          'relative px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-sm',
          isMyTurn
            ? 'bg-gradient-to-b from-primary/95 to-game-gold-dark/95 text-primary-foreground'
            : 'bg-card/90 border border-border/50 text-foreground'
        )}
        style={{
          boxShadow: isMyTurn
            ? `0 0 0 1px hsl(${hsl} / 0.45), 0 4px 20px -4px hsl(${hsl} / 0.45), 0 8px 24px -8px hsl(0 0% 0% / 0.35)`
            : '0 4px 16px -4px hsl(0 0% 0% / 0.25)',
        }}
      >
        <div className="relative flex items-center gap-2">
          <span
            className={cn(
              'text-[12px] font-display font-bold leading-none whitespace-nowrap',
              isMyTurn ? 'text-primary-foreground' : 'text-muted-foreground'
            )}
          >
            {label}
          </span>
          {isMyTurn && (
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: 'currentColor' }}
              />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
            </span>
          )}
        </div>

        {/* Tiny roll dots inside the bubble when it's my turn (top placement only) */}
        {isMyTurn && !isAi && !isLeft && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => {
              const used = i < rollsUsed;
              return (
                <div
                  key={i}
                  className={cn(
                    'w-1 h-1 rounded-full transition-all duration-300',
                    used ? 'opacity-40' : 'opacity-100'
                  )}
                  style={{
                    backgroundColor: used ? `hsl(${hsl} / 0.5)` : `hsl(${hsl})`,
                    boxShadow: !used ? `0 0 4px hsl(${hsl} / 0.8)` : 'none',
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Speech-bubble tail */}
      {isLeft ? (
        <div
          className="w-0 h-0"
          style={{
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
            borderLeft: isMyTurn ? '6px solid hsl(var(--game-gold-dark) / 0.95)' : '6px solid hsl(var(--card) / 0.9)',
            marginLeft: '-1px',
            filter: 'drop-shadow(2px 0 2px hsl(0 0% 0% / 0.25))',
          }}
        />
      ) : (
        <div
          className="w-0 h-0"
          style={{
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: isMyTurn ? '6px solid hsl(var(--game-gold-dark) / 0.95)' : '6px solid hsl(var(--card) / 0.9)',
            marginTop: '-1px',
            filter: 'drop-shadow(0 2px 2px hsl(0 0% 0% / 0.25))',
          }}
        />
      )}
    </motion.div>
  );
}
