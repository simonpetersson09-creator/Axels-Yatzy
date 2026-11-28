import { useRef, useState } from 'react';
import { Globe, Dices, Play, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { quickMatchCopy } from '@/lib/quick-match-copy';
import { useBackHandler } from '@/lib/back-handler';

interface Props {
  onOnline: (players: number) => boolean;
  onComputer: (players: number) => boolean;
  onClose: () => void;
}

export function QuickMatchChoices({ onOnline, onComputer, onClose }: Props) {
  const { t, lang } = useTranslation();
  const copy = quickMatchCopy(lang);
  const [mode, setMode] = useState<'online' | 'computer'>('online');
  const [players, setPlayers] = useState(2);
  const starting = useRef(false);
  useBackHandler(true, onClose);

  const start = () => {
    if (starting.current) return;
    starting.current = true;
    try {
      if (!(mode === 'online' ? onOnline(players) : onComputer(players))) starting.current = false;
    } catch (error) {
      starting.current = false;
      throw error;
    }
  };

  return (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('quickMatch')}>
        <Button variant={mode === 'online' ? 'default' : 'secondary'} aria-pressed={mode === 'online'}
          onClick={() => setMode('online')} className="h-auto min-h-11 px-2 py-2 whitespace-normal font-display leading-snug">
          <Globe /> <span className="min-w-0 break-words">{copy.online}</span>
        </Button>
        <Button variant={mode === 'computer' ? 'default' : 'secondary'} aria-pressed={mode === 'computer'}
          onClick={() => setMode('computer')} className="h-auto min-h-11 px-2 py-2 whitespace-normal font-display leading-snug">
          <Dices /> <span className="min-w-0 break-words">{copy.computer}</span>
        </Button>
      </div>
      <p className="text-center text-sm text-muted-foreground font-medium">{t('selectPlayerCount')}</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('selectPlayerCount')}>
        {[2, 3, 4].map(count => (
          <Button key={count} variant={players === count ? 'default' : 'secondary'}
            aria-pressed={players === count} onClick={() => setPlayers(count)} className="h-11 font-display font-bold tabular-nums">
            {count}
          </Button>
        ))}
      </div>
      <Button onClick={start} className="w-full min-h-11 h-auto py-3 whitespace-normal font-display font-bold">
        {mode === 'online' ? <Search /> : <Play />}
        {mode === 'online' ? copy.search : copy.start}
      </Button>
    </div>
  );
}