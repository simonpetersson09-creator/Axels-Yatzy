import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import HomePage from "./pages/HomePage";
import GameSetupPage from "./pages/GameSetupPage";
import GamePage from "./pages/GamePage";
import ResultsPage from "./pages/ResultsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

import SettingsPage from "./pages/SettingsPage";
import MultiplayerLobbyPage from "./pages/MultiplayerLobbyPage";
import MultiplayerGamePage from "./pages/MultiplayerGamePage";
import NotFound from "./pages/NotFound";

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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/multiplayer" element={<MultiplayerLobbyPage />} />
          <Route path="/multiplayer-game" element={<MultiplayerGamePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
