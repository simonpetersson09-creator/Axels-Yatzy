import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installNativeViewportSync } from "./lib/native-viewport";
import { trackEvent } from "./lib/analytics";
import { initSessionTracking } from "./lib/analytics-session";
import { initNotifications } from "./lib/notifications";
import { initProfileCountry } from "./lib/country-rank";
import { claimSession } from "./lib/session";
import AppErrorBoundary from "./components/AppErrorBoundary";

// Global safety net: log (and report) errors that escape React so we can see
// production failures instead of only guessing from App Store crash counts.
window.addEventListener("error", (event) => {
  try {
    trackEvent("app_uncaught_error", {
      message: String(event.message).slice(0, 300),
      source: `${event.filename}:${event.lineno}`,
    });
  } catch { /* never throw from the error handler */ }
});
window.addEventListener("unhandledrejection", (event) => {
  try {
    const reason = event.reason;
    trackEvent("app_unhandled_rejection", {
      message: (reason instanceof Error ? reason.message : String(reason)).slice(0, 300),
    });
  } catch { /* never throw from the error handler */ }
});

installNativeViewportSync();
initSessionTracking();
trackEvent('app_opened');
void claimSession();
void initNotifications();
void initProfileCountry();

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

