import { useEffect } from 'react';
import { hideGameBanner, showGameBanner } from '@/lib/admob';

/** Visar den stående annonsbannern längst ner så länge spelskärmen är öppen. */
export function useGameBanner(active = true, placement: 'game' | 'search' = 'game') {
  useEffect(() => {
    if (!active) {
      // Clear a banner and its layout reservation left by the previous screen.
      void hideGameBanner();
      return;
    }
    const show = () => { void showGameBanner(placement); };
    show();
    if (placement === 'search') {
      window.addEventListener('resize', show);
      document.addEventListener('scroll', show, true);
    }
    return () => {
      window.removeEventListener('resize', show);
      document.removeEventListener('scroll', show, true);
      void hideGameBanner();
    };
  }, [active, placement]);
}
