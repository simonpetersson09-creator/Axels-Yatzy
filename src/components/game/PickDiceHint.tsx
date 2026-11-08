import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

interface PickDiceHintProps {
  /** Render the hint (fades out when false). */
  show: boolean;
  className?: string;
  /** Alternative text, e.g. the "tap Roll to start" hint. */
  text?: string;
}

/**
 * Discreet hint shown right after the automatic first roll, telling the player
 * to pick the dice they want to keep. Absolutely positioned by the parent so it
 * never shifts the layout, and fades out as soon as a die is held.
 */
export function PickDiceHint({ show, className, text }: PickDiceHintProps) {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden={!show}
      className={cn(
        'pointer-events-none select-none rounded-full px-2 py-0.5 text-center whitespace-pre-line',
        'text-[10px] font-bold tracking-wide leading-tight',
        'transition-opacity duration-300',
        show ? 'opacity-100 pick-dice-hint-pulse' : 'opacity-0',
        className,
      )}
      style={{
        color: 'hsl(var(--primary-foreground))',
        background: 'linear-gradient(to bottom, hsl(var(--primary)), hsl(var(--game-gold-dark)))',
      }}
    >
      {text ?? t('pickDiceHint')}
    </div>
  );
}
