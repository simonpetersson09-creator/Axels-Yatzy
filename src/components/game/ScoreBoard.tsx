import { useState, useEffect, useRef, useMemo } from 'react';
import { CATEGORIES, CategoryId, Player, UPPER_BONUS_THRESHOLD, UPPER_BONUS_VALUE } from '@/types/yatzy';
import { getUpperSectionTotal, getTotalScore } from '@/lib/yatzy-scoring';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { playScoreSelectSound } from '@/lib/dice-sounds';

interface ScoreBoardProps {
  players: Player[];
  currentPlayerIndex: number;
  possibleScores: Record<CategoryId, number> | null;
  onSelectCategory: (id: CategoryId) => void;
  rollsLeft: number;
  aiChosenCategory?: string | null;
}

const PLAYER_COLORS = [
  { bg: 'bg-yatzy-player1-soft', activeBg: 'bg-yatzy-player1/20', border: 'border-yatzy-player1', text: 'text-yatzy-player1', dot: 'bg-yatzy-player1', glow: 'shadow-[0_0_12px_hsl(36_82%_52%/0.4)]', label: 'P1' },
  { bg: 'bg-yatzy-player2-soft', activeBg: 'bg-yatzy-player2/20', border: 'border-yatzy-player2', text: 'text-yatzy-player2', dot: 'bg-yatzy-player2', glow: 'shadow-[0_0_12px_hsl(210_70%_52%/0.4)]', label: 'P2' },
  { bg: 'bg-yatzy-player3-soft', activeBg: 'bg-yatzy-player3/20', border: 'border-yatzy-player3', text: 'text-yatzy-player3', dot: 'bg-yatzy-player3', glow: 'shadow-[0_0_12px_hsl(155_60%_42%/0.4)]', label: 'P3' },
  { bg: 'bg-yatzy-player4-soft', activeBg: 'bg-yatzy-player4/20', border: 'border-yatzy-player4', text: 'text-yatzy-player4', dot: 'bg-yatzy-player4', glow: 'shadow-[0_0_12px_hsl(350_65%_52%/0.4)]', label: 'P4' },
];

// Raw HSL for inline-styled tints/borders (Tailwind can't generate dynamic class names)
const PLAYER_HSL = ['36 82% 52%', '210 70% 52%', '155 60% 42%', '350 65% 52%'];

const SLOT_COUNT = 4;
const COL_W = 'min-w-[38px] w-[38px] sm:min-w-[56px] sm:w-[56px]';
const LABEL_W = 'w-[72px] min-w-[72px] sm:w-[110px] sm:min-w-[110px]';
const ROW_H = 'h-[24px] sm:h-[36px]';

function ScoreCell({ catId, isScored, scoreValue, possibleScore, canSelect, bgClass, bgStyle, onSelect, isAiChosen, playerColor }: {
  catId: string;
  isScored: boolean;
  scoreValue: number | null | undefined;
  possibleScore: number | undefined;
  canSelect: boolean;
  bgClass: string;
  bgStyle?: React.CSSProperties;
  onSelect: () => void;
  isAiChosen?: boolean;
  playerColor?: string;
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
        'relative border-r border-yatzy-line/40 last:border-r-0 text-center transition-all duration-500 ease-out flex items-center justify-center overflow-visible rounded-[2px]', ROW_H, COL_W,
        bgClass,
        isAiChosen && 'bg-primary/30 ring-2 ring-inset ring-primary/60 animate-pulse',
        canSelect && possibleScore !== undefined && possibleScore > 0 && 'bg-yatzy-highlight/25 hover:bg-yatzy-highlight/40 active:bg-yatzy-highlight/50 cursor-pointer',
        canSelect && possibleScore === 0 && 'bg-yatzy-bg hover:bg-destructive/5 active:bg-destructive/10 cursor-pointer',
      )}
      style={{ 
        boxShadow: isScored ? 'inset 0 1px 3px rgba(0,0,0,0.06)' : 'inset 0 1px 2px rgba(0,0,0,0.03)',
        WebkitTapHighlightColor: 'transparent',
        ...bgStyle,
      }}
      whileTap={canSelect ? { scale: 0.94, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } } : {}}
    >
      {canSelect && !isAiChosen && possibleScore !== undefined && possibleScore > 0 && playerColor && (
        <motion.span
          aria-hidden
          className="absolute inset-[2px] rounded-[6px] sm:rounded-[8px] pointer-events-none z-[5]"
          style={{
            border: `1.5px solid hsl(${playerColor})`,
            boxShadow: `0 0 6px hsl(${playerColor} / 0.55), inset 0 0 4px hsl(${playerColor} / 0.25)`,
          }}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
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
          canSelect && possibleScore !== undefined && possibleScore > 0 && 'font-bold text-yatzy-highlight',
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

export function ScoreBoard({ players, currentPlayerIndex, possibleScores, onSelectCategory, rollsLeft, aiChosenCategory }: ScoreBoardProps) {
  const upperCats = CATEGORIES.filter(c => c.section === 'upper');
  const lowerCats = CATEGORIES.filter(c => c.section === 'lower');

  const cellBg = (slotIdx: number): { className: string; style?: React.CSSProperties } => {
    const isCurrent = slotIdx === currentPlayerIndex;
    const player = players[slotIdx];
    if (!player) return { className: 'bg-yatzy-bg/40' };
    if (!isCurrent) return { className: 'bg-yatzy-bg' };
    const hsl = PLAYER_HSL[slotIdx] ?? PLAYER_HSL[0];
    return {
      className: '',
      style: { backgroundColor: `hsl(${hsl} / 0.10)` },
    };
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
    const bg = cellBg(slotIdx);

    return (
      <ScoreCell
        key={`${cat.id}-${player.id}`}
        catId={cat.id}
        isScored={isScored}
        scoreValue={player.scores[cat.id]}
        possibleScore={possibleScore}
        canSelect={canSelect}
        bgClass={bg.className}
        bgStyle={bg.style}
        onSelect={() => { if (canSelect) { playScoreSelectSound(); onSelectCategory(cat.id); } }}
        isAiChosen={isCurrent && aiChosenCategory === cat.id}
        playerColor={PLAYER_HSL[slotIdx]}
      />
    );
  };

  const renderRow = (cat: typeof CATEGORIES[0], idx: number) => (
    <div key={cat.id} className="flex border-b border-yatzy-line/30">
      <div className={cn(
        'flex-shrink-0 px-2 sm:px-3 border-r border-yatzy-line/40 flex items-center', ROW_H, LABEL_W,
        idx % 2 === 0 ? 'bg-yatzy-bg' : 'bg-yatzy-section-header/50',
      )}>
        <span className="text-[11px] sm:text-[12.5px] font-medium text-yatzy-text/80 leading-none">{cat.name}</span>
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
        const bg = cellBg(i);
        return (
          <div key={i} className={cn('border-r border-yatzy-line/40 last:border-r-0 text-center flex items-center justify-center transition-all duration-300', ROW_H, COL_W, bg.className)} style={bg.style}>
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
        boxShadow: '0 1px 3px hsl(0 0% 0% / 0.08), 0 4px 16px hsl(0 0% 0% / 0.06)',
      }}
    >
      {/* Header */}
      <div className={cn('bg-yatzy-header border-b border-yatzy-line/50 px-4 text-center flex items-center justify-center', ROW_H)}>
        <span className="font-display font-bold text-[15px] text-yatzy-text tracking-[0.25em] uppercase">Mr.B Yatzy</span>
      </div>

      {/* Player columns header */}
      <div className={cn('flex border-b-2 border-yatzy-line-strong/40 py-2 bg-yatzy-section-header/50')}>
        <div className={cn('flex-shrink-0 border-r border-yatzy-line/40 px-3 flex items-center', LABEL_W, ROW_H)} />
        {Array.from({ length: SLOT_COUNT }).map((_, i) => {
          const player = players[i];
          const color = PLAYER_COLORS[i];
          const isCurrent = i === currentPlayerIndex;
          const hsl = PLAYER_HSL[i];
          return (
            <div
              key={i}
              className={cn(
                'flex items-center justify-center relative overflow-hidden transition-all duration-300',
                COL_W,
              )}
              style={isCurrent && player ? {
                backgroundColor: `hsl(${hsl} / 0.10)`,
                boxShadow: `inset 0 -2px 0 0 hsl(${hsl} / 0.85)`,
              } : undefined}
            >
              {player ? (
                <motion.div 
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-1 py-1 rounded-full transition-all duration-300',
                    isCurrent 
                      ? `${color.activeBg} ${color.glow}` 
                      : ``
                  )}
                  animate={isCurrent ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <motion.div 
                    className={cn('w-2.5 h-2.5 rounded-full', color.dot)}
                    animate={isCurrent ? { scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] } : {}}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <span className={cn(
                    'text-[10px] font-bold leading-none',
                    isCurrent ? color.text : 'text-yatzy-text/50'
                  )}>
                    {color.label}
                  </span>
                </motion.div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-yatzy-line/10" />
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
