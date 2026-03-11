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
  { bg: 'bg-yatzy-player1/8', activeBg: 'bg-yatzy-player1/18', border: 'border-yatzy-player1/50', text: 'text-yatzy-player1', dot: 'bg-yatzy-player1' },
  { bg: 'bg-yatzy-player2/8', activeBg: 'bg-yatzy-player2/18', border: 'border-yatzy-player2/50', text: 'text-yatzy-player2', dot: 'bg-yatzy-player2' },
  { bg: 'bg-yatzy-player3/8', activeBg: 'bg-yatzy-player3/18', border: 'border-yatzy-player3/50', text: 'text-yatzy-player3', dot: 'bg-yatzy-player3' },
  { bg: 'bg-yatzy-player4/8', activeBg: 'bg-yatzy-player4/18', border: 'border-yatzy-player4/50', text: 'text-yatzy-player4', dot: 'bg-yatzy-player4' },
];

const SLOT_COUNT = 4;
const COL_W = 'min-w-[54px] w-[54px]';
const LABEL_W = 'w-[104px] min-w-[104px]';
const ROW_H = 'h-[34px]';

export function ScoreBoard({ players, currentPlayerIndex, possibleScores, onSelectCategory, rollsLeft }: ScoreBoardProps) {
  const upperCats = CATEGORIES.filter(c => c.section === 'upper');
  const lowerCats = CATEGORIES.filter(c => c.section === 'lower');

  const cellBg = (slotIdx: number) => {
    const isCurrent = slotIdx === currentPlayerIndex;
    const player = players[slotIdx];
    if (!player) return 'bg-yatzy-bg/40';
    const color = PLAYER_COLORS[slotIdx];
    return isCurrent ? color.activeBg : 'bg-yatzy-bg';
  };

  const renderCell = (cat: typeof CATEGORIES[0], slotIdx: number) => {
    const player = players[slotIdx];
    const isCurrent = slotIdx === currentPlayerIndex;

    if (!player) {
      return (
        <div key={`${cat.id}-empty-${slotIdx}`} className={cn('border-r border-yatzy-line/60 last:border-r-0 py-2.5 text-center', COL_W, 'bg-yatzy-bg/40')} />
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
          'border-r border-yatzy-line/60 last:border-r-0 py-2.5 text-center transition-all', COL_W,
          cellBg(slotIdx),
          canSelect && possibleScore! > 0 && 'bg-yatzy-highlight/80 hover:bg-yatzy-highlight cursor-pointer ring-1 ring-inset ring-game-gold-dark/20',
          canSelect && possibleScore === 0 && 'bg-yatzy-bg hover:bg-destructive/5 cursor-pointer',
        )}
        whileTap={canSelect ? { scale: 0.96 } : {}}
      >
        <span className={cn(
          'text-[13px] tabular-nums leading-none',
          isScored && 'font-bold text-yatzy-text',
          canSelect && possibleScore! > 0 && 'font-bold text-game-gold-dark',
          canSelect && possibleScore === 0 && 'font-medium text-yatzy-text/25',
          !isScored && !canSelect && 'text-yatzy-text/15',
        )}>
          {isScored ? player.scores[cat.id] : canSelect ? possibleScore : ''}
        </span>
      </motion.button>
    );
  };

  const renderRow = (cat: typeof CATEGORIES[0], idx: number) => (
    <div key={cat.id} className="flex border-b border-yatzy-line/50">
      <div className={cn(
        'flex-shrink-0 px-3 py-2.5 border-r border-yatzy-line/60 flex items-center', LABEL_W,
        idx % 2 === 0 ? 'bg-yatzy-bg' : 'bg-yatzy-section-header/40',
      )}>
        <span className="text-[13px] font-medium text-yatzy-text/90 leading-none tracking-tight">{cat.name}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => renderCell(cat, i))}
    </div>
  );

  const renderSumRow = (label: string, getValue: (p: Player) => string | number, bold?: boolean) => (
    <div className="flex border-b-2 border-yatzy-line bg-yatzy-sum-row">
      <div className={cn('flex-shrink-0 px-3 py-2.5 border-r border-yatzy-line/60 flex items-center', LABEL_W)}>
        <span className={cn(
          'uppercase tracking-wider leading-none',
          bold ? 'text-[12px] font-black text-yatzy-text' : 'text-[10px] font-bold text-yatzy-text/60',
        )}>{label}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => {
        const player = players[i];
        const isCurrent = i === currentPlayerIndex;
        return (
          <div key={i} className={cn('border-r border-yatzy-line/60 last:border-r-0 py-2.5 text-center', COL_W, cellBg(i))}>
            <span className={cn(
              'tabular-nums leading-none',
              bold ? 'text-[14px] font-black' : 'text-[12px] font-bold',
              player && isCurrent ? 'text-yatzy-text' : player ? 'text-yatzy-text/50' : 'text-yatzy-text/10',
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
      className="bg-yatzy-bg border-2 border-yatzy-line rounded-md shadow-lg overflow-hidden"
      style={{ minWidth: 104 + SLOT_COUNT * 54 }}
    >
      {/* Header */}
      <div className="bg-yatzy-header border-b-2 border-yatzy-line px-4 py-3 text-center">
        <span className="font-display font-bold text-base text-yatzy-text tracking-[0.2em] uppercase">Yatzy</span>
      </div>

      {/* Player columns header */}
      <div className="flex border-b-2 border-yatzy-line">
        <div className={cn('flex-shrink-0 border-r border-yatzy-line/60 bg-yatzy-section-header px-3 py-2.5', LABEL_W)} />
        {Array.from({ length: SLOT_COUNT }).map((_, i) => {
          const player = players[i];
          const color = PLAYER_COLORS[i];
          const isCurrent = i === currentPlayerIndex;
          return (
            <div
              key={i}
              className={cn(
                'py-2.5 text-center border-r border-yatzy-line/60 last:border-r-0 flex flex-col items-center justify-center gap-1',
                COL_W,
                player && isCurrent ? color.activeBg : player ? color.bg : 'bg-yatzy-section-header/30',
                player && isCurrent && 'border-b-[3px]',
                player && isCurrent && color.border,
              )}
            >
              {player ? (
                <>
                  <div className={cn(
                    'w-3 h-3 rounded-full',
                    color.dot,
                    isCurrent && 'ring-2 ring-offset-1 ring-offset-yatzy-bg',
                    isCurrent && color.border,
                  )} />
                  <span className={cn(
                    'text-[11px] font-bold leading-none',
                    isCurrent ? 'text-yatzy-text' : 'text-yatzy-text/40'
                  )}>
                    P{i + 1}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-yatzy-text/10">–</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Upper section */}
      <div className="bg-yatzy-section-header/60 border-b border-yatzy-line/50 px-3 py-1">
        <span className="text-[9px] font-bold text-yatzy-text/35 uppercase tracking-[0.15em]">Övre sektionen</span>
      </div>
      {upperCats.map((cat, idx) => renderRow(cat, idx))}

      {renderSumRow('Summa', (p) => `${getUpperSectionTotal(p.scores)}`)}
      {renderSumRow('Bonus ≥63', (p) => {
        const ut = getUpperSectionTotal(p.scores);
        return ut >= UPPER_BONUS_THRESHOLD ? `+${UPPER_BONUS_VALUE}` : '0';
      })}

      {/* Lower section */}
      <div className="bg-yatzy-section-header/60 border-b border-yatzy-line/50 px-3 py-1">
        <span className="text-[9px] font-bold text-yatzy-text/35 uppercase tracking-[0.15em]">Nedre sektionen</span>
      </div>
      {lowerCats.map((cat, idx) => renderRow(cat, idx))}

      {renderSumRow('Totalt', (p) => getTotalScore(p.scores), true)}
    </div>
  );
}
