import { useState, useEffect, useRef, useMemo } from 'react';
import { CATEGORIES, Category, CategoryId, Player, UPPER_BONUS_THRESHOLD, UPPER_BONUS_VALUE } from '@/types/yatzy';
import { getUpperSectionTotal, getTotalScore } from '@/lib/yatzy-scoring';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { playScoreSelectSound } from '@/lib/dice-sounds';
import { useTranslation, type TranslationKey } from '@/lib/i18n';

interface ScoreBoardProps {
  players: Player[];
  currentPlayerIndex: number;
  possibleScores: Record<CategoryId, number> | null;
  onSelectCategory: (id: CategoryId, debug?: ScoreboardClickDebug) => void;
  rollsLeft: number;
  aiChosenCategory?: string | null;
  selectionDisabled?: boolean;
  nativeIos?: boolean;
}

export interface ScoreboardClickDebug {
  rowText: string;
  clickedCategoryId: CategoryId;
  renderedRowIndex: number;
  actualSavedCategory: CategoryId;
  currentPlayer: string;
  score: number | null;
  pointerType: string;
  clientX: number | null;
  clientY: number | null;
  rowTop: number;
  rowBottom: number;
  rowLeft: number;
  rowRight: number;
  hitWithinRow: boolean;
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
const COL_W = 'min-w-[42px] w-[42px]';
const LABEL_W = 'w-[80px] min-w-[80px]';
const ROW_H = 'h-[34px]';

function ScoreCell({ isScored, scoreValue, possibleScore, canSelect, bgClass, bgStyle, isAiChosen, playerColor, rowHeight, colWidth }: {
  isScored: boolean;
  scoreValue: number | null | undefined;
  possibleScore: number | undefined;
  canSelect: boolean;
  bgClass: string;
  bgStyle?: React.CSSProperties;
  isAiChosen?: boolean;
  playerColor?: string;
  rowHeight?: string;
  colWidth?: string;
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
    <div
      className={cn(
        'relative border-r border-yatzy-line/40 last:border-r-0 text-center transition-colors duration-300 ease-out flex items-center justify-center overflow-hidden rounded-[2px] pointer-events-none', rowHeight ?? ROW_H, colWidth ?? COL_W,
        bgClass,
        isAiChosen && 'bg-primary/30 ring-2 ring-inset ring-primary/60 animate-pulse',
        canSelect && possibleScore !== undefined && possibleScore > 0 && 'bg-yatzy-highlight/25',
        canSelect && possibleScore !== undefined && possibleScore > 0 && 'group-hover:bg-yatzy-highlight/40',
        canSelect && possibleScore === 0 && 'bg-yatzy-bg',
        canSelect && possibleScore === 0 && 'group-hover:bg-destructive/5',
      )}
      style={{
        boxShadow: isScored ? 'inset 0 1px 3px rgba(0,0,0,0.06)' : 'inset 0 1px 2px rgba(0,0,0,0.03)',
        ...bgStyle,
      }}
    >
      {canSelect && !isAiChosen && possibleScore !== undefined && possibleScore > 0 && playerColor && (
        <motion.span
          aria-hidden
          className="absolute inset-[2px] rounded-[6px] pointer-events-none z-[5]"
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
          `${rowHeight === 'h-[28px]' ? 'text-[11px]' : 'text-[13px]'} tabular-nums leading-none`,
          isScored && 'font-normal text-yatzy-text',
          canSelect && possibleScore !== undefined && possibleScore > 0 && 'font-normal text-yatzy-highlight',
          canSelect && possibleScore === 0 && 'font-normal text-yatzy-text/25',
          !isScored && !canSelect && 'text-yatzy-text/10',
        )}
        animate={justScored ? { scale: [1, 1.4, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {isScored ? scoreValue : canSelect ? possibleScore : ''}
      </motion.span>
    </div>
  );
}

export function ScoreBoard({ players, currentPlayerIndex, possibleScores, onSelectCategory, rollsLeft, aiChosenCategory, selectionDisabled, nativeIos = false }: ScoreBoardProps) {
  const { t } = useTranslation();
  const catName = (id: CategoryId) => t(`cat_${id}` as TranslationKey);
  const rowHeight = nativeIos ? 'h-[24px]' : ROW_H;
  const labelWidth = nativeIos ? 'w-[66px] min-w-[66px]' : LABEL_W;
  const colWidth = nativeIos ? 'min-w-[31px] w-[31px]' : COL_W;
  const lastPointerRef = useRef<{ pointerType: string; clientX: number | null; clientY: number | null }>({
    pointerType: 'unknown',
    clientX: null,
    clientY: null,
  });
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

  const renderCell = (cat: Category, slotIdx: number) => {
    const player = players[slotIdx];
    const isCurrent = slotIdx === currentPlayerIndex;

    if (!player) {
      return (
        <div key={`${cat.id}-empty-${slotIdx}`} className={cn('border-r border-yatzy-line/40 last:border-r-0 text-center flex items-center justify-center', rowHeight, colWidth, 'bg-yatzy-bg/30')} />
      );
    }

    const isScored = player.scores[cat.id] !== undefined && player.scores[cat.id] !== null;
    const possibleScore = isCurrent ? possibleScores?.[cat.id] : undefined;
    const canSelect = isCurrent && !isScored && possibleScore !== undefined && rollsLeft < 3;
    const bg = cellBg(slotIdx);

    return (
      <ScoreCell
        key={`${cat.id}-${player.id}`}
        isScored={isScored}
        scoreValue={player.scores[cat.id]}
        possibleScore={possibleScore}
        canSelect={canSelect}
        bgClass={bg.className}
        bgStyle={bg.style}
        isAiChosen={isCurrent && aiChosenCategory === cat.id}
        playerColor={PLAYER_HSL[slotIdx]}
        rowHeight={rowHeight}
        colWidth={colWidth}
      />
    );
  };

  const renderRow = (cat: Category, idx: number) => {
    const renderedRowIndex = CATEGORIES.findIndex(c => c.id === cat.id);
    const currentPlayer = players[currentPlayerIndex];
    const isScored = !!currentPlayer && currentPlayer.scores[cat.id] !== undefined && currentPlayer.scores[cat.id] !== null;
    const possibleScore = possibleScores?.[cat.id];
    const canSelectRow = !!currentPlayer && !isScored && possibleScore !== undefined && rollsLeft < 3 && !selectionDisabled;

    const handleRowClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const rect = event.currentTarget.getBoundingClientRect();
      const clientX = lastPointerRef.current.clientX ?? event.clientX ?? null;
      const clientY = lastPointerRef.current.clientY ?? event.clientY ?? null;
      const debug: ScoreboardClickDebug = {
        rowText: catName(cat.id),
        clickedCategoryId: cat.id,
        renderedRowIndex,
        actualSavedCategory: cat.id,
        currentPlayer: currentPlayer?.name ?? 'unknown',
        score: possibleScore ?? null,
        pointerType: lastPointerRef.current.pointerType,
        clientX,
        clientY,
        rowTop: rect.top,
        rowBottom: rect.bottom,
        rowLeft: rect.left,
        rowRight: rect.right,
        hitWithinRow: clientX !== null && clientY !== null
          ? clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
          : true,
      };

      console.log('scoreboard-row-click', debug);

      if (!canSelectRow) return;
      playScoreSelectSound();
      onSelectCategory(cat.id, debug);
    };

    return (
    <button
      key={cat.id}
      type="button"
      data-score-row="true"
      data-category-id={cat.id}
      data-category-name={catName(cat.id)}
      data-rendered-row-index={renderedRowIndex}
      aria-label={`${catName(cat.id)} (${cat.id})`}
      aria-disabled={!canSelectRow}
      onPointerDown={(event) => {
        event.stopPropagation();
        lastPointerRef.current = {
          pointerType: event.pointerType || 'pointer',
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }}
      onPointerUp={(event) => {
        lastPointerRef.current = {
          pointerType: event.pointerType || 'pointer',
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }}
      onClick={handleRowClick}
      className={cn(
        'group flex w-full border-b border-yatzy-line/30 p-0 m-0 text-left bg-transparent rounded-none overflow-hidden touch-manipulation',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yatzy-highlight',
        canSelectRow ? 'cursor-pointer' : 'cursor-default',
      )}
      style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
    >
      <div className={cn(
        'flex-shrink-0 px-2 border-r border-yatzy-line/40 flex items-center', rowHeight, labelWidth,
        idx % 2 === 0 ? 'bg-yatzy-bg' : 'bg-yatzy-section-header/50',
      )}>
        <span className={`${nativeIos ? 'text-[9px]' : 'text-[11px]'} font-medium text-yatzy-text/80 leading-none whitespace-nowrap overflow-hidden text-ellipsis block w-full`}>{catName(cat.id)}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => renderCell(cat, i))}
    </button>
    );
  };

  const renderSumRow = (label: string, getValue: (p: Player) => string | number, isTotalRow?: boolean) => (
    <div className={cn(
      'flex',
      isTotalRow ? 'border-t-2 border-yatzy-line-strong py-1' : 'border-b border-yatzy-line/50',
      isTotalRow ? 'bg-yatzy-header' : 'bg-yatzy-sum-row',
    )}>
      <div className={cn('flex-shrink-0 px-2 border-r border-yatzy-line/40 flex items-center', rowHeight, labelWidth)}>
        <span className={cn(
          'uppercase tracking-wider leading-none whitespace-nowrap overflow-hidden text-ellipsis block w-full',
          isTotalRow ? `${nativeIos ? 'text-[8px]' : 'text-[10px]'} font-medium text-yatzy-text` : `${nativeIos ? 'text-[8px]' : 'text-[9px]'} font-normal text-yatzy-text/50`,
        )}>{label}</span>
      </div>
      {Array.from({ length: SLOT_COUNT }).map((_, i) => {
        const player = players[i];
        const isCurrent = i === currentPlayerIndex;
        const bg = cellBg(i);
        return (
          <div key={i} className={cn('border-r border-yatzy-line/40 last:border-r-0 text-center flex items-center justify-center transition-all duration-500 ease-out', rowHeight, colWidth, bg.className)} style={bg.style}>
            <span className={cn(
              'tabular-nums leading-none',
              isTotalRow ? `${nativeIos ? 'text-[11px]' : 'text-[13px]'} font-normal` : `${nativeIos ? 'text-[10px]' : 'text-[12px]'} font-normal`,
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
      <div className={cn('bg-yatzy-header border-b border-yatzy-line/50 px-3 text-center flex items-center justify-center', rowHeight)}>
        <span className={`${nativeIos ? 'text-[12px]' : 'text-[15px]'} font-display font-bold text-yatzy-text tracking-[0.25em] uppercase`}>{t('appName')}</span>
      </div>

      {/* Player columns header */}
      <div className={cn('flex border-b-2 border-yatzy-line-strong/40 py-1 bg-yatzy-section-header/50')}>
        <div className={cn('flex-shrink-0 border-r border-yatzy-line/40 px-2 flex items-center', labelWidth, rowHeight)} />
        {Array.from({ length: SLOT_COUNT }).map((_, i) => {
          const player = players[i];
          const color = PLAYER_COLORS[i];
          const isCurrent = i === currentPlayerIndex;
          const hsl = PLAYER_HSL[i];
          return (
            <div
              key={i}
              className={cn(
                'flex items-center justify-center relative overflow-hidden transition-all duration-500 ease-out',
                colWidth,
              )}
              style={isCurrent && player ? {
                backgroundColor: `hsl(${hsl} / 0.10)`,
                boxShadow: `inset 0 -2px 0 0 hsl(${hsl} / 0.85)`,
              } : undefined}
            >
              {player ? (
                <motion.div 
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-1 py-1 rounded-full transition-all duration-500 ease-out',
                    isCurrent 
                      ? `${color.activeBg} ${color.glow}` 
                      : ``
                  )}
                  animate={isCurrent ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <motion.div 
                    className={cn(nativeIos ? 'w-2 h-2' : 'w-2.5 h-2.5', 'rounded-full', color.dot)}
                    animate={isCurrent ? { scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] } : {}}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <span className={cn(
                    `${nativeIos ? 'text-[8px]' : 'text-[10px]'} font-bold leading-none`,
                    isCurrent ? color.text : 'text-yatzy-text/50'
                  )}>
                    {color.label}
                  </span>
                </motion.div>
              ) : (
                <div className={`${nativeIos ? 'w-5 h-5' : 'w-6 h-6'} rounded-full bg-yatzy-line/10`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Upper section */}
      <div className={`border-b border-yatzy-line/30 px-3 flex items-center justify-center ${nativeIos ? 'h-[16px]' : 'h-[20px]'}`} style={{ backgroundColor: 'hsl(195 45% 22% / 0.18)' }}>
        <span className="text-[9px] font-normal text-black uppercase tracking-[0.15em]">{t('upperSection')}</span>
      </div>
      {upperCats.map((cat, idx) => renderRow(cat, idx))}

      {renderSumRow(t('sum'), (p) => `${getUpperSectionTotal(p.scores)}`)}
      {renderSumRow(t('bonus'), (p) => {
        const ut = getUpperSectionTotal(p.scores);
        return ut >= UPPER_BONUS_THRESHOLD ? `+${UPPER_BONUS_VALUE}` : '0';
      })}

      {/* Lower section */}
      <div className={`border-b border-yatzy-line/30 px-3 flex items-center justify-center ${nativeIos ? 'h-[16px]' : 'h-[20px]'}`} style={{ backgroundColor: 'hsl(195 45% 22% / 0.18)' }}>
        <span className="text-[9px] font-normal text-black uppercase tracking-[0.15em]">{t('lowerSection')}</span>
      </div>
      {lowerCats.map((cat, idx) => renderRow(cat, idx))}

      {renderSumRow(t('total'), (p) => getTotalScore(p.scores), true)}
    </div>
  );
}
