import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CRMProvider, useCRM } from "@/context/CRMContext";
import { FloatingChatProvider } from "@/context/FloatingChatContext";
import { FloatingChatManager } from "@/components/FloatingChatManager";
import LoginPage from "./pages/LoginPage";
import AppLayout from "./components/AppLayout";
import PipelinePage from "./pages/PipelinePage";
import LeadDetailPage from "./pages/LeadDetailPage";
import LeadsPage from "./pages/LeadsPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import PilotPage from "./pages/PilotPage";
import AgentesPage from "./pages/AgentesPage";
import RezultPayPage from "./pages/RezultPayPage";
import MultiatendimentoPage from "./pages/MultiatendimentoPage";
import AutomacoesPage from "./pages/AutomacoesPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { isLoggedIn } = useCRM();

  if (!isLoggedIn) return <LoginPage />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/pilot" element={<PilotPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/pipeline/lead/:id" element={<LeadDetailPage />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/contatos" element={<Navigate to="/leads" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/agentes" element={<AgentesPage />} />
        <Route path="/rezult-pay" element={<RezultPayPage />} />
        <Route path="/multiatendimento" element={<MultiatendimentoPage />} />
        <Route path="/automacoes" element={<AutomacoesPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <CRMProvider>
          <FloatingChatProvider>
            <AppRoutes />
            <FloatingChatManager />
          </FloatingChatProvider>
        </CRMProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
