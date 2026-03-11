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

const PLAYER_COLORS = [
  { bg: 'bg-yatzy-player1/15', activeBg: 'bg-yatzy-player1/25', text: 'text-yatzy-player1', dot: 'bg-yatzy-player1' },
  { bg: 'bg-yatzy-player2/15', activeBg: 'bg-yatzy-player2/25', text: 'text-yatzy-player2', dot: 'bg-yatzy-player2' },
  { bg: 'bg-yatzy-player3/15', activeBg: 'bg-yatzy-player3/25', text: 'text-yatzy-player3', dot: 'bg-yatzy-player3' },
  { bg: 'bg-yatzy-player4/15', activeBg: 'bg-yatzy-player4/25', text: 'text-yatzy-player4', dot: 'bg-yatzy-player4' },
];

const SLOT_COUNT = 4;

export function ScoreBoard({ players, currentPlayerIndex, possibleScores, onSelectCategory, rollsLeft }: ScoreBoardProps) {
  const upperCats = CATEGORIES.filter(c => c.section === 'upper');
  const lowerCats = CATEGORIES.filter(c => c.section === 'lower');

  const renderCell = (cat: typeof CATEGORIES[0], slotIdx: number) => {
    const player = players[slotIdx];
    if (!player) {
      return (
        <div key={`${cat.id}-empty-${slotIdx}`} className="border-r border-yatzy-line last:border-r-0 px-1 py-1.5 text-center min-w-[44px] bg-yatzy-bg" />
      );
    }

    const isCurrent = slotIdx === currentPlayerIndex;
    const isScored = player.scores[cat.id] !== undefined && player.scores[cat.id] !== null;
    const possibleScore = isCurrent ? possibleScores?.[cat.id] : undefined;
    const canSelect = isCurrent && !isScored && possibleScore !== undefined && rollsLeft < 3;

    return (
      <motion.button
        key={`${cat.id}-${player.id}`}
        onClick={() => canSelect && onSelectCategory(cat.id)}
        disabled={!canSelect}
        className={cn(
          'border-r border-yatzy-line last:border-r-0 px-1 py-1.5 text-center transition-colors min-w-[44px]',
          canSelect && possibleScore! > 0 && 'bg-yatzy-highlight hover:bg-yatzy-header cursor-pointer',
          canSelect && possibleScore === 0 && 'bg-destructive/10 hover:bg-destructive/15 cursor-pointer',
          !canSelect && 'bg-yatzy-bg'
        )}
        whileTap={canSelect ? { scale: 0.96 } : {}}
      >
        <span className={cn(
          'text-xs font-bold text-yatzy-text',
          canSelect && possibleScore! > 0 && 'text-game-gold-dark',
          canSelect && possibleScore === 0 && 'text-destructive/50',
        )}>
          {isScored ? player.scores[cat.id] : canSelect ? possibleScore : ''}
        </span>
      </motion.button>
    );
  };

  const renderRow = (cat: typeof CATEGORIES[0]) => (
    <div key={cat.id} className="flex border-b border-yatzy-line last:border-b-0">
      <div className="flex-shrink-0 w-[90px] px-2 py-1.5 border-r border-yatzy-line bg-yatzy-bg flex items-center">
        <span className="text-xs font-medium text-yatzy-text">{cat.name}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => renderCell(cat, i))}
    </div>
  );

  const renderSumRow = (label: string, getValue: (p: Player) => string | number, thick?: boolean) => (
    <div className={cn('flex', thick ? 'border-y-2 border-yatzy-line' : 'border-b border-yatzy-line', 'bg-yatzy-sum-row')}>
      <div className="flex-shrink-0 w-[90px] px-2 py-1.5 border-r border-yatzy-line flex items-center">
        <span className="text-[10px] font-bold text-yatzy-text/70 uppercase">{label}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => {
        const player = players[i];
        return (
          <div key={i} className="border-r border-yatzy-line last:border-r-0 px-1 py-1.5 text-center min-w-[44px]">
            <span className={cn('text-xs font-bold', player ? 'text-yatzy-text' : 'text-yatzy-text/20')}>
              {player ? getValue(player) : '–'}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="bg-yatzy-bg border-2 border-yatzy-line rounded-sm shadow-md overflow-hidden" style={{ minWidth: 90 + SLOT_COUNT * 48 }}>
      {/* Header */}
      <div className="bg-yatzy-header border-b-2 border-yatzy-line px-3 py-2 text-center">
        <span className="font-display font-bold text-sm text-yatzy-text tracking-wider uppercase">Yatzy</span>
      </div>

      {/* Player names row with colors */}
      <div className="flex border-b-2 border-yatzy-line">
        <div className="flex-shrink-0 w-[90px] border-r border-yatzy-line bg-yatzy-section-header px-2 py-1.5">
          <span className="text-[10px] font-bold text-yatzy-text/50 uppercase">Kategori</span>
        </div>
        {Array.from({ length: SLOT_COUNT }).map((_, i) => {
          const player = players[i];
          const color = PLAYER_COLORS[i];
          const isCurrent = i === currentPlayerIndex;
          return (
            <div
              key={i}
              className={cn(
                'px-1 py-1.5 text-center border-r border-yatzy-line last:border-r-0 min-w-[44px] flex flex-col items-center gap-0.5',
                player && isCurrent ? color.activeBg : player ? color.bg : 'bg-yatzy-section-header'
              )}
            >
              {player ? (
                <>
                  <div className={cn('w-2 h-2 rounded-full', color.dot)} />
                  <span className={cn(
                    'text-[10px] font-bold truncate max-w-[40px]',
                    isCurrent ? 'text-yatzy-text' : 'text-yatzy-text/60'
                  )}>
                    {player.name}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-yatzy-text/20">–</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Upper section */}
      <div className="bg-yatzy-section-header border-b border-yatzy-line px-2 py-0.5">
        <span className="text-[9px] font-bold text-yatzy-text/50 uppercase tracking-wider">Övre</span>
      </div>
      {upperCats.map(renderRow)}

      {renderSumRow('Summa', (p) => `${getUpperSectionTotal(p.scores)}`)}
      {renderSumRow('Bonus', (p) => {
        const ut = getUpperSectionTotal(p.scores);
        return ut >= UPPER_BONUS_THRESHOLD ? `+${UPPER_BONUS_VALUE}` : '0';
      }, true)}

      {/* Lower section */}
      <div className="bg-yatzy-section-header border-b border-yatzy-line px-2 py-0.5">
        <span className="text-[9px] font-bold text-yatzy-text/50 uppercase tracking-wider">Nedre</span>
      </div>
      {lowerCats.map(renderRow)}

      {renderSumRow('Totalt', (p) => getTotalScore(p.scores), true)}
    </div>
  );
}
