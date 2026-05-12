import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installNativeViewportSync } from "./lib/native-viewport";

installNativeViewportSync();

createRoot(document.getElementById("root")!).render(<App />);
