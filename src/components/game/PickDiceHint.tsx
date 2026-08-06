import { cn } from '@/lib/utils';

interface PickDiceHintProps {
  /** Render the hint (fades out when false). */
  show: boolean;
  className?: string;
}

/**
 * Discreet hint shown right after the automatic first roll, telling the player
 * to pick the dice they want to keep. Absolutely positioned by the parent so it
 * never shifts the layout, and fades out as soon as a die is held.
 */
export function PickDiceHint({ show, className }: PickDiceHintProps) {
  return (
    <div
      aria-hidden={!show}
      className={cn(
        'pointer-events-none select-none whitespace-nowrap rounded-full px-3 py-1',
        'text-[11px] font-medium tracking-wide',
        'transition-opacity duration-300',
        show ? 'opacity-70' : 'opacity-0',
        className,
      )}
      style={{
        color: 'hsl(var(--game-gold))',
        border: '1px solid hsl(var(--game-gold) / 0.35)',
        background: 'hsl(var(--game-gold) / 0.08)',
      }}
    >
      Välj tärningar att behålla
    </div>
  );
}
