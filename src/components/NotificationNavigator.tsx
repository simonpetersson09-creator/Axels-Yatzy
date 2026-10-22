import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { consumeWaitingNotification } from '@/lib/waiting-room';

/**
 * Bridges window-level navigation events (dispatched by push-notification
 * handlers in src/lib/notifications.ts) into React Router's navigate().
 * Lives inside <BrowserRouter> so navigate() is available.
 */
export default function NotificationNavigator() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ path: string; state?: unknown }>).detail;
      if (detail?.path) navigate(detail.path, detail.state ? { state: detail.state } : undefined);
    };
    window.addEventListener("app:navigate", handler);
    const seat = consumeWaitingNotification();
    if (seat) navigate(`/waiting-room?seat=${encodeURIComponent(seat)}`);
    return () => window.removeEventListener("app:navigate", handler);
  }, [navigate]);
  return null;
}
