import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Capacitor } from "@capacitor/core";
import HomePage from "./pages/HomePage";
import GameSetupPage from "./pages/GameSetupPage";
import GamePage from "./pages/GamePage";
import ResultsPage from "./pages/ResultsPage";
import SettingsPage from "./pages/SettingsPage";
import StatsPage from "./pages/StatsPage";
import WebOnlyAppPage from "./pages/WebOnlyAppPage";
import MultiplayerLobbyPage from "./pages/MultiplayerLobbyPage";
import MultiplayerGamePage from "./pages/MultiplayerGamePage";
import FriendStatsPage from "./pages/FriendStatsPage";
import FriendsListPage from "./pages/FriendsListPage";
import LegalPage from "./pages/LegalPage";
import JoinPage from "./pages/JoinPage";
import NotFound from "./pages/NotFound";
import { MultiplayerProvider } from "./hooks/MultiplayerProvider";
import { lazy, Suspense, useEffect } from "react";
import { preloadDiceEngine } from "./components/dice-engine/preload";
import InviteOverlay from "./components/InviteOverlay";
import NotificationNavigator from "./components/NotificationNavigator";

// Admin dashboard is available in dev and on web (Lovable preview / browser),
// but NEVER bundled into native iOS App Store builds.
// The game is iPhone-app only. On the public web every game route shows an
// App Store page instead; the Lovable preview and local dev stay playable.
const IS_PREVIEW_HOST = (() => {
  try {
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h.startsWith('id-preview--') || h.endsWith('.lovableproject.com');
  } catch { return false; }
})();
const WEB_BLOCKED = !Capacitor.isNativePlatform() && !import.meta.env.DEV && !IS_PREVIEW_HOST;
const WEB_OPEN_PATHS = ['/join', '/legal', '/admin'];

const WebGate = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  if (WEB_BLOCKED && !WEB_OPEN_PATHS.includes(pathname)) return <WebOnlyAppPage />;
  return <>{children}</>;
};

const ADMIN_ENABLED = import.meta.env.DEV || !Capacitor.isNativePlatform();
const AdminPage = ADMIN_ENABLED ? lazy(() => import("./pages/AdminPage")) : null;
const DevFriendPage = ADMIN_ENABLED ? lazy(() => import("./pages/DevFriendPage")) : null;
const DevFriendBotRunner = ADMIN_ENABLED ? lazy(() => import("./components/DevFriendBotRunner")) : null;

const queryClient = new QueryClient();

/** Prefetches the 3D dice chunk during idle time so the first roll is smooth. */
const DiceEnginePreloader = () => {
  useEffect(() => {
    preloadDiceEngine();
  }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DiceEnginePreloader />
        <InviteOverlay />
        <NotificationNavigator />
        {ADMIN_ENABLED && DevFriendBotRunner && (
          <Suspense fallback={null}>
            <DevFriendBotRunner />
          </Suspense>
        )}
        <WebGate>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/index" element={<Navigate to="/" replace />} />
          <Route path="/setup" element={<GameSetupPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route element={<MultiplayerProvider />}>
            <Route path="/multiplayer" element={<MultiplayerLobbyPage />} />
            <Route path="/multiplayer-game" element={<MultiplayerGamePage />} />
          </Route>
          <Route path="/friend-stats" element={<FriendStatsPage />} />
          <Route path="/friends" element={<FriendsListPage />} />

          <Route path="/legal" element={<LegalPage />} />
          {ADMIN_ENABLED && AdminPage && (
            <Route
              path="/admin"
              element={
                <Suspense fallback={<div className="p-8">Loading…</div>}>
                  <AdminPage />
                </Suspense>
              }
            />
          )}
          {ADMIN_ENABLED && DevFriendPage && (
            <Route
              path="/dev-friend"
              element={
                <Suspense fallback={<div className="p-8">Loading…</div>}>
                  <DevFriendPage />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </WebGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
