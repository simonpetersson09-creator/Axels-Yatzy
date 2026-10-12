import { useEffect } from 'react';
import { hideGameBanner, showGameBanner } from '@/lib/admob';

/** Visar den stående annonsbannern längst ner så länge spelskärmen är öppen. */
export function useGameBanner(active = true) {
  useEffect(() => {
    if (!active) return;
    void showGameBanner();
    return () => { void hideGameBanner(); };
  }, [active]);
}
