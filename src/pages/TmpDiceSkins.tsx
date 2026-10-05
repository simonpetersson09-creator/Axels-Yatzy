import { DiceArea } from '@/components/game/DiceArea';
import type { DiceSkin } from '@/lib/dice-skin';
const SKINS: DiceSkin[] = ['white', 'bronze', 'silver', 'gold'];
export default function TmpDiceSkins() {
  return (
    <div className="min-h-screen flex gap-2 justify-center pt-6 bg-background">
      {SKINS.map((s) => (
        <div key={s} className="flex flex-col items-center">
          <p className="text-foreground text-sm mb-2">{s}</p>
          <DiceArea dice={[6, 5, 4, 3, 2]} lockedDice={[false, true, false, false, false]} rollsLeft={2} isRolling={false} onToggleLock={() => {}} compact skin={s} />
        </div>
      ))}
    </div>
  );
}
