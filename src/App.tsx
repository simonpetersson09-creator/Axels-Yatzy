import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Capacitor } from "@capacitor/core";
import HomePage from "./pages/HomePage";
import GameSetupPage from "./pages/GameSetupPage";
import GamePage from "./pages/GamePage";
import ResultsPage from "./pages/ResultsPage";
import SettingsPage from "./pages/SettingsPage";
import MultiplayerLobbyPage from "./pages/MultiplayerLobbyPage";
import MultiplayerGamePage from "./pages/MultiplayerGamePage";
import FriendStatsPage from "./pages/FriendStatsPage";
import NotFound from "./pages/NotFound";
import { lazy, Suspense } from "react";

// Admin dashboard is available in dev and on web (Lovable preview / browser),
// but NEVER bundled into native iOS App Store builds.
const ADMIN_ENABLED = import.meta.env.DEV || !Capacitor.isNativePlatform();
const AdminPage = ADMIN_ENABLED ? lazy(() => import("./pages/AdminPage")) : null;

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/setup" element={<GameSetupPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/multiplayer" element={<MultiplayerLobbyPage />} />
          <Route path="/multiplayer-game" element={<MultiplayerGamePage />} />
          <Route path="/friend-stats" element={<FriendStatsPage />} />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
