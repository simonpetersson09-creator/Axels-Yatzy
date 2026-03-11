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
  { bg: 'bg-yatzy-player1/10', activeBg: 'bg-yatzy-player1/20', border: 'border-yatzy-player1/40', text: 'text-yatzy-player1', dot: 'bg-yatzy-player1' },
  { bg: 'bg-yatzy-player2/10', activeBg: 'bg-yatzy-player2/20', border: 'border-yatzy-player2/40', text: 'text-yatzy-player2', dot: 'bg-yatzy-player2' },
  { bg: 'bg-yatzy-player3/10', activeBg: 'bg-yatzy-player3/20', border: 'border-yatzy-player3/40', text: 'text-yatzy-player3', dot: 'bg-yatzy-player3' },
  { bg: 'bg-yatzy-player4/10', activeBg: 'bg-yatzy-player4/20', border: 'border-yatzy-player4/40', text: 'text-yatzy-player4', dot: 'bg-yatzy-player4' },
];

const SLOT_COUNT = 4;
const COL_W = 'min-w-[52px] w-[52px]';
const LABEL_W = 'w-[100px] min-w-[100px]';

export function ScoreBoard({ players, currentPlayerIndex, possibleScores, onSelectCategory, rollsLeft }: ScoreBoardProps) {
  const upperCats = CATEGORIES.filter(c => c.section === 'upper');
  const lowerCats = CATEGORIES.filter(c => c.section === 'lower');

  const cellBg = (slotIdx: number) => {
    const isCurrent = slotIdx === currentPlayerIndex;
    const player = players[slotIdx];
    if (!player) return 'bg-yatzy-bg/50';
    const color = PLAYER_COLORS[slotIdx];
    return isCurrent ? color.activeBg : 'bg-yatzy-bg';
  };

  const renderCell = (cat: typeof CATEGORIES[0], slotIdx: number) => {
    const player = players[slotIdx];
    const isCurrent = slotIdx === currentPlayerIndex;

    if (!player) {
      return (
        <div key={`${cat.id}-empty-${slotIdx}`} className={cn('border-r border-yatzy-line last:border-r-0 py-2 text-center', COL_W, 'bg-yatzy-bg/50')} />
      );
    }

    const isScored = player.scores[cat.id] !== undefined && player.scores[cat.id] !== null;
    const possibleScore = isCurrent ? possibleScores?.[cat.id] : undefined;
    const canSelect = isCurrent && !isScored && possibleScore !== undefined && rollsLeft < 3;

    return (
      <motion.button
        key={`${cat.id}-${player.id}`}
        onClick={() => canSelect && onSelectCategory(cat.id)}
        disabled={!canSelect}
        className={cn(
          'border-r border-yatzy-line last:border-r-0 py-2 text-center transition-all', COL_W,
          cellBg(slotIdx),
          canSelect && possibleScore! > 0 && 'bg-yatzy-highlight hover:bg-yatzy-header cursor-pointer',
          canSelect && possibleScore === 0 && 'bg-destructive/10 hover:bg-destructive/15 cursor-pointer',
        )}
        whileTap={canSelect ? { scale: 0.96 } : {}}
      >
        <span className={cn(
          'text-[13px] tabular-nums',
          isScored && 'font-bold text-yatzy-text',
          canSelect && possibleScore! > 0 && 'font-bold text-game-gold-dark',
          canSelect && possibleScore === 0 && 'font-medium text-destructive/40',
          !isScored && !canSelect && 'text-yatzy-text/20',
        )}>
          {isScored ? player.scores[cat.id] : canSelect ? possibleScore : '·'}
        </span>
      </motion.button>
    );
  };

  const renderRow = (cat: typeof CATEGORIES[0], idx: number) => (
    <div key={cat.id} className={cn('flex border-b border-yatzy-line', idx % 2 === 1 && 'bg-yatzy-bg')}>
      <div className={cn('flex-shrink-0 px-3 py-2 border-r border-yatzy-line bg-yatzy-bg flex items-center', LABEL_W)}>
        <span className="text-[13px] font-medium text-yatzy-text leading-tight">{cat.name}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => renderCell(cat, i))}
    </div>
  );

  const renderSumRow = (label: string, getValue: (p: Player) => string | number, bold?: boolean) => (
    <div className={cn('flex border-b-2 border-yatzy-line bg-yatzy-sum-row')}>
      <div className={cn('flex-shrink-0 px-3 py-2 border-r border-yatzy-line flex items-center', LABEL_W)}>
        <span className={cn('text-[11px] font-bold text-yatzy-text/70 uppercase tracking-wide', bold && 'text-[13px] text-yatzy-text')}>{label}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => {
        const player = players[i];
        const isCurrent = i === currentPlayerIndex;
        return (
          <div key={i} className={cn('border-r border-yatzy-line last:border-r-0 py-2 text-center', COL_W, cellBg(i))}>
            <span className={cn(
              'tabular-nums',
              bold ? 'text-sm font-black' : 'text-xs font-bold',
              player && isCurrent ? 'text-yatzy-text' : player ? 'text-yatzy-text/60' : 'text-yatzy-text/15',
            )}>
              {player ? getValue(player) : '–'}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className="bg-yatzy-bg border-2 border-yatzy-line rounded shadow-lg overflow-hidden"
      style={{ minWidth: 100 + SLOT_COUNT * 52 }}
    >
      {/* Header */}
      <div className="bg-yatzy-header border-b-2 border-yatzy-line px-4 py-2.5 text-center">
        <span className="font-display font-bold text-base text-yatzy-text tracking-widest uppercase">Yatzy</span>
      </div>

      {/* Player names row */}
      <div className="flex border-b-2 border-yatzy-line">
        <div className={cn('flex-shrink-0 border-r border-yatzy-line bg-yatzy-section-header px-3 py-2', LABEL_W)} />
        {Array.from({ length: SLOT_COUNT }).map((_, i) => {
          const player = players[i];
          const color = PLAYER_COLORS[i];
          const isCurrent = i === currentPlayerIndex;
          return (
            <div
              key={i}
              className={cn(
                'py-2 text-center border-r border-yatzy-line last:border-r-0 flex flex-col items-center justify-center gap-1',
                COL_W,
                player && isCurrent ? color.activeBg : player ? color.bg : 'bg-yatzy-section-header/50',
                player && isCurrent && 'border-b-2',
                player && isCurrent && color.border,
              )}
            >
              {player ? (
                <>
                  <div className={cn('w-2.5 h-2.5 rounded-full shadow-sm', color.dot)} />
                  <span className={cn(
                    'text-[10px] font-bold truncate max-w-[48px] leading-none',
                    isCurrent ? 'text-yatzy-text' : 'text-yatzy-text/50'
                  )}>
                    {player.name}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-yatzy-text/15">–</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Upper section */}
      <div className="bg-yatzy-section-header border-b border-yatzy-line px-3 py-1">
        <span className="text-[10px] font-bold text-yatzy-text/40 uppercase tracking-widest">Övre sektionen</span>
      </div>
      {upperCats.map((cat, idx) => renderRow(cat, idx))}

      {renderSumRow('Summa', (p) => `${getUpperSectionTotal(p.scores)}`)}
      {renderSumRow('Bonus ≥63', (p) => {
        const ut = getUpperSectionTotal(p.scores);
        return ut >= UPPER_BONUS_THRESHOLD ? `+${UPPER_BONUS_VALUE}` : '0';
      })}

      {/* Lower section */}
      <div className="bg-yatzy-section-header border-b border-yatzy-line px-3 py-1">
        <span className="text-[10px] font-bold text-yatzy-text/40 uppercase tracking-widest">Nedre sektionen</span>
      </div>
      {lowerCats.map((cat, idx) => renderRow(cat, idx))}

      {renderSumRow('Totalt', (p) => getTotalScore(p.scores), true)}
    </div>
  );
}
