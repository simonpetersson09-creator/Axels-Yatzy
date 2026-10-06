import { DiceArea } from '@/components/game/DiceArea';
export default function TmpDiceSkins() {
  return (
    <div id="d" style={{ background: 'transparent', display: 'inline-block' }}>
      <DiceArea dice={[5, 5, 5, 5, 5]} lockedDice={[false, false, false, false, false]} rollsLeft={2} isRolling={false} onToggleLock={() => {}} compact skin="gold" />
    </div>
  );
}
