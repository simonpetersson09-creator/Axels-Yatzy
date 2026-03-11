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
  const upperTotal = getUpperSectionTotal(currentPlayer.scores);
  const hasBonus = upperTotal >= UPPER_BONUS_THRESHOLD;

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
          'flex items-center justify-between border-b border-r border-yatzy-line',
          'px-2 py-1.5 transition-colors text-left',
          'last:border-b-0',
          canSelect && possibleScore! > 0 && 'bg-yatzy-highlight hover:bg-yatzy-header cursor-pointer',
          canSelect && possibleScore === 0 && 'bg-destructive/10 hover:bg-destructive/15 cursor-pointer',
          !canSelect && !isScored && 'bg-yatzy-bg',
          isScored && 'bg-yatzy-bg'
        )}
        whileTap={canSelect ? { scale: 0.98 } : {}}
      >
        <span className={cn(
          'text-xs font-medium text-yatzy-text',
          canSelect && possibleScore! > 0 && 'text-game-gold-dark font-semibold',
          isScored && 'text-yatzy-text/60'
        )}>
          {cat.name}
        </span>
        <span className={cn(
          'text-xs font-bold min-w-[24px] text-right text-yatzy-text',
          canSelect && possibleScore! > 0 && 'text-game-gold-dark',
          canSelect && possibleScore === 0 && 'text-destructive/50',
          isScored && 'text-yatzy-text'
        )}>
          {isScored ? currentPlayer.scores[cat.id] : canSelect ? possibleScore : ''}
        </span>
      </motion.button>
    );
  };

  return (
    <div className="bg-yatzy-bg border-2 border-yatzy-line rounded-sm shadow-md overflow-hidden" style={{ minWidth: 220 }}>
      {/* Header */}
      <div className="bg-yatzy-header border-b-2 border-yatzy-line px-3 py-2 text-center">
        <span className="font-display font-bold text-sm text-yatzy-text tracking-wider uppercase">Yatzy</span>
      </div>

      {/* Player tabs for multiplayer */}
      {players.length > 1 && (
        <div className="flex border-b-2 border-yatzy-line">
          {players.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex-1 text-center py-1.5 text-xs font-semibold border-r border-yatzy-line last:border-r-0 transition-colors',
                i === currentPlayerIndex
                  ? 'bg-yatzy-highlight text-yatzy-text font-bold'
                  : 'bg-yatzy-bg text-yatzy-text/50'
              )}
            >
              {p.name}
            </div>
          ))}
        </div>
      )}

      {/* Upper section header */}
      <div className="bg-yatzy-section-header border-b border-yatzy-line px-2 py-1">
        <span className="text-[10px] font-bold text-yatzy-text/70 uppercase tracking-wider">Övre</span>
      </div>

      {/* Upper categories */}
      <div className="flex flex-col">
        {upperCats.map(renderRow)}
      </div>

      {/* Upper sum + bonus row */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b-2 border-t border-yatzy-line bg-yatzy-sum-row">
        <span className="text-[10px] font-bold text-yatzy-text/70 uppercase">
          Summa {upperTotal}/{UPPER_BONUS_THRESHOLD}
        </span>
        <span className={cn(
          'text-xs font-bold',
          hasBonus ? 'text-game-success' : 'text-yatzy-text/40'
        )}>
          Bonus: {hasBonus ? `+${UPPER_BONUS_VALUE}` : '0'}
        </span>
      </div>

      {/* Lower section header */}
      <div className="bg-yatzy-section-header border-b border-yatzy-line px-2 py-1">
        <span className="text-[10px] font-bold text-yatzy-text/70 uppercase tracking-wider">Nedre</span>
      </div>

      {/* Lower categories */}
      <div className="flex flex-col">
        {lowerCats.map(renderRow)}
      </div>

      {/* Total row */}
      <div className="flex items-center justify-between px-2 py-2 border-t-2 border-yatzy-line bg-yatzy-sum-row">
        <span className="text-sm font-bold text-yatzy-text">Totalt</span>
        <span className="text-sm font-black text-yatzy-text">
          {getTotalScore(currentPlayer.scores)}
        </span>
      </div>
    </div>
  );
}
