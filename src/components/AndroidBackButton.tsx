import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { runTopBackHandler } from '@/lib/back-handler';
import { t } from '@/lib/i18n';

const MATCH_ROUTES = ['/game', '/multiplayer-game'];

/** Closes an open Radix dialog/sheet by simulating Escape. */
function closeOpenRadixDialog(): boolean {
  const open = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  if (!open) return false;
  open.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}

/**
 * Android hardware back / back gesture:
 * 1. close the open overlay, 2. in a match ask before leaving (the match can
 * be resumed from home, same as the Home button), 3. go back a page,
 * 4. on the home screen send the app to the background instead of closing it.
 */
export function AndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { App } = await import('@capacitor/app');
      const sub = await App.addListener('backButton', () => {
        if (runTopBackHandler()) return;
        if (closeOpenRadixDialog()) return;
        const path = pathRef.current;
        if (path === '/' || path === '/index') {
          void App.minimizeApp();
          return;
        }
        if (MATCH_ROUTES.includes(path)) {
          if (window.confirm(t('leaveMatchConfirm'))) navigate('/');
          return;
        }
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate('/', { replace: true });
      });
      if (cancelled) void sub.remove();
      else remove = () => void sub.remove();
    })();
    return () => { cancelled = true; remove?.(); };
  }, [navigate]);

  return null;
}
