import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CRMProvider, useCRM } from "@/context/CRMContext";
import LoginPage from "./pages/LoginPage";
import AppLayout from "./components/AppLayout";
import PipelinePage from "./pages/PipelinePage";
import ContactsPage from "./pages/ContactsPage";
import TasksPage from "./pages/TasksPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import { LeadDrawer } from "./components/LeadDrawer";

const queryClient = new QueryClient();

function AppRoutes() {
  const { isLoggedIn, selectedLeadId, setSelectedLeadId } = useCRM();

  if (!isLoggedIn) return <LoginPage />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/pipeline" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/contatos" element={<ContactsPage />} />
          <Route path="/tarefas" element={<TasksPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* Global drawer for contacts page */}
      <LeadDrawer leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <CRMProvider>
          <AppRoutes />
        </CRMProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
