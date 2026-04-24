import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CRMProvider } from "@/context/CRMContext";
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
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0F4F8" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginPage />;

  return (
    <CRMProvider>
      <FloatingChatProvider>
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
        <FloatingChatManager />
      </FloatingChatProvider>
    </CRMProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
