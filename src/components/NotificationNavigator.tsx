import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Bridges window-level navigation events (dispatched by push-notification
 * handlers in src/lib/notifications.ts) into React Router's navigate().
 * Lives inside <BrowserRouter> so navigate() is available.
 */
export default function NotificationNavigator() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ path: string }>).detail;
      if (detail?.path) navigate(detail.path);
    };
    window.addEventListener("app:navigate", handler);
    return () => window.removeEventListener("app:navigate", handler);
  }, [navigate]);
  return null;
}
