import { CATEGORIES, CategoryId, Player, UPPER_BONUS_THRESHOLD, UPPER_BONUS_VALUE } from '@/types/yatzy';
import { getUpperSectionTotal, getTotalScore } from '@/lib/yatzy-scoring';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface ScoreBoardProps {
  players: Player[];
  currentPlayerIndex: number;
  possibleScores: Record<CategoryId, number> | null;
  onSelectCategory: (id: CategoryId) => void;
  rollsLeft: number;
}

export function ScoreBoard({ players, currentPlayerIndex, possibleScores, onSelectCategory, rollsLeft }: ScoreBoardProps) {
  const currentPlayer = players[currentPlayerIndex];
  const upperCats = CATEGORIES.filter(c => c.section === 'upper');
  const lowerCats = CATEGORIES.filter(c => c.section === 'lower');

  const renderRow = (cat: typeof CATEGORIES[0]) => {
    const isScored = currentPlayer.scores[cat.id] !== undefined && currentPlayer.scores[cat.id] !== null;
    const possibleScore = possibleScores?.[cat.id];
    const canSelect = !isScored && possibleScore !== undefined && rollsLeft < 3;

    return (
      <motion.button
        key={cat.id}
        onClick={() => canSelect && onSelectCategory(cat.id)}
        disabled={!canSelect}
        className={cn(
          'flex items-center justify-between px-3 py-2.5 rounded-lg transition-all',
          isScored && 'bg-muted/30',
          canSelect && possibleScore! > 0 && 'bg-game-gold/10 hover:bg-game-gold/20 cursor-pointer',
          canSelect && possibleScore === 0 && 'bg-destructive/5 hover:bg-destructive/10 cursor-pointer',
          !canSelect && !isScored && 'opacity-40'
        )}
        whileTap={canSelect ? { scale: 0.98 } : {}}
      >
        <span className={cn(
          'text-sm font-medium',
          canSelect && possibleScore! > 0 && 'text-game-gold',
          isScored && 'text-muted-foreground'
        )}>
          {cat.name}
        </span>
        <span className={cn(
          'text-sm font-bold min-w-[28px] text-right',
          canSelect && possibleScore! > 0 && 'text-game-gold',
          canSelect && possibleScore === 0 && 'text-muted-foreground',
          isScored && 'text-foreground'
        )}>
          {isScored ? currentPlayer.scores[cat.id] : canSelect ? possibleScore : '–'}
        </span>
      </motion.button>
    );
  };

  const upperTotal = getUpperSectionTotal(currentPlayer.scores);
  const hasBonus = upperTotal >= UPPER_BONUS_THRESHOLD;

  return (
    <div className="glass-card p-3 space-y-1">
      {/* Player tabs for multiplayer */}
      {players.length > 1 && (
        <div className="flex gap-1 mb-2">
          {players.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex-1 text-center py-1.5 rounded-lg text-xs font-semibold transition-all',
                i === currentPlayerIndex
                  ? 'bg-game-gold text-primary-foreground'
                  : 'bg-muted/30 text-muted-foreground'
              )}
            >
              {p.name}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-1">
        Övre sektionen
      </div>
      {upperCats.map(renderRow)}

      <div className="flex items-center justify-between px-3 py-2 border-t border-b border-border/50">
        <span className="text-xs font-semibold text-muted-foreground">
          Summa ({upperTotal}/{UPPER_BONUS_THRESHOLD})
        </span>
        <span className={cn(
          'text-xs font-bold',
          hasBonus ? 'text-game-success' : 'text-muted-foreground'
        )}>
          Bonus: {hasBonus ? `+${UPPER_BONUS_VALUE}` : '0'}
        </span>
      </div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-1">
        Nedre sektionen
      </div>
      {lowerCats.map(renderRow)}

      <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/50 mt-1">
        <span className="text-sm font-bold">Totalt</span>
        <span className="text-sm font-black text-game-gold">
          {getTotalScore(currentPlayer.scores)}
        </span>
      </div>
    </div>
  );
}
