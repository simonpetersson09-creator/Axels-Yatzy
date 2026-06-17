import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installNativeViewportSync } from "./lib/native-viewport";
import { trackEvent } from "./lib/analytics";
import { initSessionTracking } from "./lib/analytics-session";
import { initNotifications } from "./lib/notifications";
import { initProfileCountry } from "./lib/country-rank";

installNativeViewportSync();
initSessionTracking();
trackEvent('app_opened');
void initNotifications();
void initProfileCountry();

createRoot(document.getElementById("root")!).render(<App />);
