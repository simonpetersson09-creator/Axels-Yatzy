import { DiceArea } from '@/components/game/DiceArea';
export default function RingTest() {
  return (
    <div className="flex gap-10 bg-black p-10">
      {[0,1,2,3].map(p => (
        <DiceArea key={p} dice={[1,2,3,4,5]} lockedDice={[true,true,true,true,true]} rollsLeft={2} isRolling={false} onToggleLock={()=>{}} playerIndex={p} />
      ))}
    </div>
  );
}
