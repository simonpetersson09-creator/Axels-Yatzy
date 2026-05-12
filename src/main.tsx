import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installNativeViewportSync } from "./lib/native-viewport";
import { trackEvent } from "./lib/analytics";

installNativeViewportSync();
trackEvent('app_opened');

createRoot(document.getElementById("root")!).render(<App />);
