import { useState, useEffect, useRef, useMemo } from 'react';
import { CATEGORIES, CategoryId, Player, UPPER_BONUS_THRESHOLD, UPPER_BONUS_VALUE } from '@/types/yatzy';
import { getUpperSectionTotal, getTotalScore } from '@/lib/yatzy-scoring';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ScoreBoardProps {
  players: Player[];
  currentPlayerIndex: number;
  possibleScores: Record<CategoryId, number> | null;
  onSelectCategory: (id: CategoryId) => void;
  rollsLeft: number;
}

const PLAYER_COLORS = [
  { bg: 'bg-yatzy-player1-soft', activeBg: 'bg-yatzy-player1/15', border: 'border-yatzy-player1', text: 'text-yatzy-player1', dot: 'bg-yatzy-player1', label: 'P1' },
  { bg: 'bg-yatzy-player2-soft', activeBg: 'bg-yatzy-player2/15', border: 'border-yatzy-player2', text: 'text-yatzy-player2', dot: 'bg-yatzy-player2', label: 'P2' },
  { bg: 'bg-yatzy-player3-soft', activeBg: 'bg-yatzy-player3/15', border: 'border-yatzy-player3', text: 'text-yatzy-player3', dot: 'bg-yatzy-player3', label: 'P3' },
  { bg: 'bg-yatzy-player4-soft', activeBg: 'bg-yatzy-player4/15', border: 'border-yatzy-player4', text: 'text-yatzy-player4', dot: 'bg-yatzy-player4', label: 'P4' },
];

const SLOT_COUNT = 4;
const COL_W = 'min-w-[56px] w-[56px]';
const LABEL_W = 'w-[110px] min-w-[110px]';
const ROW_H = 'h-[34px]';

function ScoreCell({ catId, isScored, scoreValue, possibleScore, canSelect, bgClass, onSelect }: {
  catId: string;
  isScored: boolean;
  scoreValue: number | null | undefined;
  possibleScore: number | undefined;
  canSelect: boolean;
  bgClass: string;
  onSelect: () => void;
}) {
  const [justScored, setJustScored] = useState(false);
  const prevScoredRef = useRef(isScored);

  useEffect(() => {
    if (isScored && !prevScoredRef.current) {
      setJustScored(true);
      const t = setTimeout(() => setJustScored(false), 700);
      return () => clearTimeout(t);
    }
    prevScoredRef.current = isScored;
  }, [isScored]);

  const sparkles = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 14 + Math.random() * 10;
      return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 2 + Math.random() * 2, delay: Math.random() * 0.08 };
    }),
  [isScored]);

  return (
    <motion.button
      onClick={onSelect}
      disabled={!canSelect}
      className={cn(
        'relative border-r border-yatzy-line/40 last:border-r-0 text-center transition-all flex items-center justify-center overflow-visible', ROW_H, COL_W,
        bgClass,
        canSelect && possibleScore !== undefined && possibleScore > 0 && 'bg-yatzy-highlight hover:brightness-95 cursor-pointer ring-1 ring-inset ring-game-gold-dark/25',
        canSelect && possibleScore === 0 && 'bg-yatzy-bg hover:bg-destructive/5 cursor-pointer',
      )}
      whileTap={canSelect ? { scale: 0.96 } : {}}
    >
      <AnimatePresence>
        {justScored && sparkles.map((s, i) => (
          <motion.div
            key={`sp-${i}`}
            className="absolute pointer-events-none z-10"
            style={{
              width: s.size, height: s.size, borderRadius: '50%',
              background: 'radial-gradient(circle, hsl(42 90% 70%), hsl(36 82% 52%))',
              boxShadow: '0 0 4px hsl(42 90% 60%)',
              left: '50%', top: '50%',
              marginLeft: -s.size / 2, marginTop: -s.size / 2,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.5 }}
            animate={{ x: s.x, y: s.y, opacity: 0, scale: 1.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, delay: s.delay, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {justScored && (
          <motion.div
            className="absolute pointer-events-none z-10 inset-0"
            style={{ border: '2px solid hsl(36 82% 52%)', borderRadius: 4 }}
            initial={{ scale: 0.7, opacity: 0.9 }}
            animate={{ scale: 1.4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <motion.span
        className={cn(
          'text-[13px] tabular-nums leading-none',
          isScored && 'font-bold text-yatzy-text',
          canSelect && possibleScore !== undefined && possibleScore > 0 && 'font-bold text-game-gold-dark',
          canSelect && possibleScore === 0 && 'font-medium text-yatzy-text/25',
          !isScored && !canSelect && 'text-yatzy-text/10',
        )}
        animate={justScored ? { scale: [1, 1.4, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {isScored ? scoreValue : canSelect ? possibleScore : ''}
      </motion.span>
    </motion.button>
  );
}

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
        <div key={`${cat.id}-empty-${slotIdx}`} className={cn('border-r border-yatzy-line/40 last:border-r-0 text-center flex items-center justify-center', ROW_H, COL_W, 'bg-yatzy-bg/30')} />
      );
    }

    const isScored = player.scores[cat.id] !== undefined && player.scores[cat.id] !== null;
    const possibleScore = isCurrent ? possibleScores?.[cat.id] : undefined;
    const canSelect = isCurrent && !isScored && possibleScore !== undefined && rollsLeft < 3;

    return (
      <ScoreCell
        key={`${cat.id}-${player.id}`}
        catId={cat.id}
        isScored={isScored}
        scoreValue={player.scores[cat.id]}
        possibleScore={possibleScore}
        canSelect={canSelect}
        bgClass={cellBg(slotIdx)}
        onSelect={() => canSelect && onSelectCategory(cat.id)}
      />
    );
  };

  const renderRow = (cat: typeof CATEGORIES[0], idx: number) => (
    <div key={cat.id} className="flex border-b border-yatzy-line/30">
      <div className={cn(
        'flex-shrink-0 px-3 border-r border-yatzy-line/40 flex items-center', ROW_H, LABEL_W,
        idx % 2 === 0 ? 'bg-yatzy-bg' : 'bg-yatzy-section-header/50',
      )}>
        <span className="text-[12.5px] font-medium text-yatzy-text/80 leading-none">{cat.name}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => renderCell(cat, i))}
    </div>
  );

  const renderSumRow = (label: string, getValue: (p: Player) => string | number, isTotalRow?: boolean) => (
    <div className={cn(
      'flex',
      isTotalRow ? 'border-t-2 border-yatzy-line-strong' : 'border-b border-yatzy-line/50',
      isTotalRow ? 'bg-yatzy-header' : 'bg-yatzy-sum-row',
    )}>
      <div className={cn('flex-shrink-0 px-3 border-r border-yatzy-line/40 flex items-center', ROW_H, LABEL_W)}>
        <span className={cn(
          'uppercase tracking-wider leading-none',
          isTotalRow ? 'text-[11px] font-black text-yatzy-text' : 'text-[10px] font-bold text-yatzy-text/50',
        )}>{label}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => {
        const player = players[i];
        const isCurrent = i === currentPlayerIndex;
        return (
          <div key={i} className={cn('border-r border-yatzy-line/40 last:border-r-0 text-center flex items-center justify-center', ROW_H, COL_W, cellBg(i))}>
            <span className={cn(
              'tabular-nums leading-none',
              isTotalRow ? 'text-[14px] font-black' : 'text-[12px] font-bold',
              player && isCurrent ? 'text-yatzy-text' : player ? 'text-yatzy-text/40' : 'text-yatzy-text/10',
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
      className="bg-yatzy-bg border border-yatzy-line-strong/30 rounded-lg overflow-hidden"
      style={{
        minWidth: 110 + SLOT_COUNT * 56,
        boxShadow: '0 1px 3px hsl(0 0% 0% / 0.08), 0 4px 16px hsl(0 0% 0% / 0.06)',
      }}
    >
      {/* Header */}
      <div className={cn('bg-yatzy-header border-b border-yatzy-line/50 px-4 text-center flex items-center justify-center', ROW_H)}>
        <span className="font-display font-bold text-[15px] text-yatzy-text tracking-[0.25em] uppercase">Yatzy</span>
      </div>

      {/* Player columns header */}
      <div className={cn('flex border-b-2 border-yatzy-line-strong/40')}>
        <div className={cn('flex-shrink-0 border-r border-yatzy-line/40 bg-yatzy-section-header px-3 flex items-center', LABEL_W, ROW_H)} />
        {Array.from({ length: SLOT_COUNT }).map((_, i) => {
          const player = players[i];
          const color = PLAYER_COLORS[i];
          const isCurrent = i === currentPlayerIndex;
          return (
            <div
              key={i}
              className={cn(
                'text-center border-r border-yatzy-line/40 last:border-r-0 flex items-center justify-center relative',
                COL_W, ROW_H,
                player ? (isCurrent ? color.activeBg : color.bg) : 'bg-yatzy-section-header/30',
              )}
            >
              {player ? (
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full',
                    color.dot,
                    isCurrent && 'ring-[1.5px] ring-offset-1 ring-offset-yatzy-bg',
                    isCurrent && color.border.replace('border-', 'ring-'),
                  )} />
                  <span className={cn(
                    'text-[11px] font-bold leading-none',
                    isCurrent ? 'text-yatzy-text' : 'text-yatzy-text/35'
                  )}>
                    {color.label}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] text-yatzy-text/10">–</span>
              )}
              {/* Active indicator bar */}
              {player && isCurrent && (
                <div className={cn('absolute bottom-0 left-1 right-1 h-[2.5px] rounded-t-full', color.dot)} />
              )}
            </div>
          );
        })}
      </div>

      {/* Upper section */}
      <div className={cn('bg-yatzy-section-header border-b border-yatzy-line/30 px-3 flex items-center', ROW_H)}>
        <span className="text-[9px] font-bold text-yatzy-text/30 uppercase tracking-[0.15em]">Övre sektionen</span>
      </div>
      {upperCats.map((cat, idx) => renderRow(cat, idx))}

      {renderSumRow('Summa', (p) => `${getUpperSectionTotal(p.scores)}`)}
      {renderSumRow('Bonus ≥63', (p) => {
        const ut = getUpperSectionTotal(p.scores);
        return ut >= UPPER_BONUS_THRESHOLD ? `+${UPPER_BONUS_VALUE}` : '0';
      })}

      {/* Lower section */}
      <div className={cn('bg-yatzy-section-header border-b border-yatzy-line/30 px-3 flex items-center', ROW_H)}>
        <span className="text-[9px] font-bold text-yatzy-text/30 uppercase tracking-[0.15em]">Nedre sektionen</span>
      </div>
      {lowerCats.map((cat, idx) => renderRow(cat, idx))}

      {renderSumRow('Totalt', (p) => getTotalScore(p.scores), true)}
    </div>
  );
}
