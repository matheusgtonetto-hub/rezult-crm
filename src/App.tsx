import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CRMProvider } from "@/context/CRMContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { CompanyProvider, useCompany } from "@/context/CompanyContext";
import { FloatingChatProvider } from "@/context/FloatingChatContext";
import { usePermissions } from "@/hooks/usePermissions";
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
import CalendarPage from "./pages/CalendarPage";
import AgentesPage from "./pages/AgentesPage";
import RezultPayPage from "./pages/RezultPayPage";
import MultiatendimentoPage from "./pages/MultiatendimentoPage";
import AutomacoesPage from "./pages/AutomacoesPage";
import DisparosPage from "./pages/DisparosPage";
import DisparoDetailPage from "./pages/DisparoDetailPage";
import CompanyRegisterPage from "./pages/CompanyRegisterPage";
import SetupPage from "./pages/SetupPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import MetaCallbackPage from "./pages/MetaCallbackPage";
import WhatsappCallbackPage from "./pages/WhatsappCallbackPage";
import NotFound from "./pages/NotFound";
import GoogleOAuthCallback from "./pages/configuracoes/GoogleOAuthCallback";
import PlanosPage from "./pages/Planos";
import CheckoutSuccessPage from "./pages/CheckoutSuccess";

const queryClient = new QueryClient();

function SmartRedirect() {
  const { companyLoading, permissionsReady } = useCompany();
  const { can, isOwner } = usePermissions();

  if (companyLoading || !permissionsReady) return null;

  const hasDashboard = isOwner || can("admin") || can("dashboard:admin") || can("dashboard:member");
  return <Navigate to={hasDashboard ? "/dashboard" : "/pipeline"} replace />;
}

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <CompanyProvider>
    <ProfileProvider>
    <CRMProvider>
      <FloatingChatProvider>
        <Routes>
          <Route path="/" element={<SmartRedirect />} />
          <Route path="/login" element={<SmartRedirect />} />
          <Route path="/verify-2fa" element={<Verify2FAPage />} />
          <Route path="/company-register" element={<CompanyRegisterPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/planos" element={<PlanosPage />} />
          <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/configuracoes/email/callback" element={<GoogleOAuthCallback />} />
          <Route path="/auth/meta-callback" element={<MetaCallbackPage />} />
          <Route path="/whatsapp-callback" element={<WhatsappCallbackPage />} />
          <Route element={<AppLayout />}>
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/pipeline/lead/:id" element={<LeadDetailPage />} />
            <Route path="/pipeline/:pipelineId" element={<PipelinePage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/contatos" element={<Navigate to="/leads" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/agentes" element={<AgentesPage />} />
            <Route path="/rezult-pay" element={<RezultPayPage />} />
            <Route path="/multiatendimento" element={<MultiatendimentoPage />} />
            <Route path="/automacoes" element={<AutomacoesPage />} />
            <Route path="/automacoes/:id" element={<AutomacoesPage />} />
            <Route path="/disparos" element={<DisparosPage />} />
            <Route path="/disparos/:id" element={<DisparoDetailPage />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/configuracoes/:section" element={<SettingsPage />} />
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
