import { createRoot } from 'react-dom/client';
import './index.css';
import { DiceSet } from '@/components/dice-engine';
import { getDesign, designLook, designSwatchBg } from '@/lib/dice-designs';
const ids = (new URLSearchParams(location.search).get('ids') ?? 'legend').split(',');
createRoot(document.getElementById('r')!).render(
  <div style={{ padding: 8 }}>
    {ids.map((id) => { const d = getDesign(id)!; return (
      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 110 }}>
        <div style={{ width: 70, height: 70, borderRadius: 16, background: designSwatchBg(d), boxShadow: d.glow ? `0 0 14px ${d.glow}` : undefined, flexShrink: 0 }} />
        <div style={{ width: 340, height: 100 }}>
          <DiceSet values={[1, 2, 3, 5, 6]} held={[false, false, true, false, false]} rolling={false} skin={designLook(id) as never} />
        </div>
      </div>); })}
  </div>,
);
