import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CRMProvider } from "@/context/CRMContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { CompanyProvider } from "@/context/CompanyContext";
import { FloatingChatProvider } from "@/context/FloatingChatContext";
import { FloatingChatManager } from "@/components/FloatingChatManager";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Verify2FAPage from "./pages/Verify2FAPage";
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
import CompanyRegisterPage from "./pages/CompanyRegisterPage";
import SetupPage from "./pages/SetupPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { session, loading, pendingPasswordReset, clearPendingPasswordReset } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (pendingPasswordReset) {
      clearPendingPasswordReset();
      navigate("/reset-password", { replace: true });
    }
  }, [pendingPasswordReset]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0F4F8" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-2fa" element={<Verify2FAPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <CompanyProvider>
    <ProfileProvider>
    <CRMProvider>
      <FloatingChatProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/company-register" element={<CompanyRegisterPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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
    </ProfileProvider>
    </CompanyProvider>
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
