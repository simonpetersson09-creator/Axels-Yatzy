import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { runTopBackHandler } from '@/lib/back-handler';

// Screens where an edge swipe must not leave (home, running matches, results).
const BLOCKED = ['/', '/index', '/game', '/multiplayer-game', '/results'];
const EDGE_PX = 32;
const MIN_DX = 70;

/** Swipe from the left edge to the right to go back a page (iOS-style). */
export function SwipeBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t.clientX <= EDGE_PX ? { x: t.clientX, y: t.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      start = null;
      if (dx < MIN_DX || dy > dx / 2) return;
      if (BLOCKED.includes(pathRef.current)) return;
      if (runTopBackHandler()) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) navigate(-1);
      else navigate('/', { replace: true });
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [navigate]);

  return null;
}
