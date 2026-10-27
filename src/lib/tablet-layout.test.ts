import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const css = read('src/index.css');

/** Bodies of every `@media (min-width: 700px) and (min-height: 600px)…` block (the iPad rules). */
function tabletBlocks(): string[] {
  const out: string[] = [];
  const re = /@media \(min-width: 700px\) and \(min-height: 600px\)[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    out.push(css.slice(re.lastIndex, i - 1));
  }
  return out;
}

describe('iPad layout rules', () => {
  it('has tablet rules', () => {
    expect(tabletBlocks().length).toBeGreaterThanOrEqual(3);
  });

  it('never targets game parts by text size or DOM position', () => {
    for (const body of tabletBlocks()) {
      expect(body).not.toMatch(/\.text-\\\[/);
      expect(body).not.toMatch(/:first-child/);
      expect(body).not.toMatch(/> \.(flex|relative)/);
    }
  });

  it('game pages carry the stable class names the iPad rules use', () => {
    const game = read('src/pages/GamePage.tsx');
    for (const c of ['game-player-names', 'game-player-row', 'game-player-name', 'game-dice-column', 'game-roll-button', 'game-nav-button']) {
      expect(game).toContain(c);
    }
    const mp = read('src/pages/MultiplayerGamePage.tsx');
    for (const c of ['mp-player-names', 'mp-player-row', 'mp-player-name', 'mp-dice-column', 'mp-roll-button', 'game-nav-button']) {
      expect(mp).toContain(c);
    }
    expect(read('src/components/game/ForfeitButton.tsx')).toContain('game-nav-button');
    const sb = read('src/components/game/ScoreBoard.tsx');
    expect(sb).toContain('sb-fs-s');
    expect(sb).toContain('sb-fs-m');
    expect(sb).toContain('sb-fs-l');
  });

  it('every iPad selector class exists in the source', () => {
    const src = ['src/pages/GamePage.tsx', 'src/pages/MultiplayerGamePage.tsx', 'src/components/game/ForfeitButton.tsx', 'src/components/game/ScoreBoard.tsx'].map(read).join('\n');
    for (const c of ['sb-fs-s', 'sb-fs-m', 'sb-fs-l', 'game-player-names', 'game-dice-column', 'game-roll-button', 'game-nav-button']) {
      expect(tabletBlocks().join('\n')).toContain(c);
      expect(src).toContain(c);
    }
  });

  it('the phone-only top-gap override cannot apply on iPad', () => {
    const idx = css.indexOf('--game-top-gap: max(');
    const before = css.slice(Math.max(0, idx - 400), idx);
    expect(before).toContain('@media (max-width: 699px), (max-height: 599px)');
  });

  it('home design parts are sized for iPad', () => {
    const body = tabletBlocks()[0];
    for (const c of ['.home-card-chip', '.home-card-pill', '.home-round-action', '.home-quick-hint', '.home-waiting-badge']) {
      expect(body).toContain(c);
    }
  });
});
