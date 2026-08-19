import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { FreePlanBanner, BANNER_HEIGHT } from "@/components/FreePlanBanner";
import { PlanLimitModal } from "@/components/PlanLimitModal";
import { BillingBlockedModal } from "@/components/BillingBlockedModal";

// Routes where the user is actively completing onboarding — no redirect needed
const ONBOARDING_PATHS = ["/company-register", "/setup"];

export default function AppLayout() {
  const { crmLoading }                                                    = useCRM();
  const { company, companyLoading, planExpired, isFreePlan, planDaysLeft, billingBlocked } = useCompany();
  const navigate                                                          = useNavigate();
  const { pathname }                                                      = useLocation();
  const [planLimitResource, setPlanLimitResource] = useState<string | null>(null);
  const [billingBlockedOpen, setBillingBlockedOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const resource = (e as CustomEvent<{ resource: string }>).detail.resource;
      setPlanLimitResource(resource);
    };
    window.addEventListener("plan-limit-reached", handler);
    return () => window.removeEventListener("plan-limit-reached", handler);
  }, []);

  useEffect(() => {
    const handler = () => setBillingBlockedOpen(true);
    window.addEventListener("billing-blocked", handler);
    return () => window.removeEventListener("billing-blocked", handler);
  }, []);

  // Only redirect to company-register if:
  // 1. Company data has finished loading
  // 2. No company record exists
  // 3. User is not already on an onboarding route (safety guard)
  useEffect(() => {
    if (companyLoading) return;
    if (!company && !ONBOARDING_PATHS.includes(pathname)) {
      navigate("/company-register", { replace: true });
    }
  }, [companyLoading, company, pathname, navigate]);

  if (crmLoading || companyLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "hsl(var(--background))" }}
      >
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Bloqueio por cobrança não implica plano expirado (uma anual pode falhar com
  // validade ainda no futuro), então a tarja tem os dois gatilhos.
  const showBanner = isFreePlan || billingBlocked;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <AppSidebar />
      <main
        style={{
          marginLeft: 52,
          width: "calc(100vw - 52px)",
          height: "100vh",
          overflowY: "auto",
          overflowX: "hidden",
          background: "hsl(var(--background))",
          paddingBottom: showBanner ? BANNER_HEIGHT : 0,
        }}
      >
        <div style={{ width: "100%", height: "100%", boxSizing: "border-box" }}>
          <Outlet />
        </div>
      </main>

      <FreePlanBanner />
      {planLimitResource && (
        <PlanLimitModal resource={planLimitResource} onClose={() => setPlanLimitResource(null)} />
      )}
      {billingBlockedOpen && (
        <BillingBlockedModal onClose={() => setBillingBlockedOpen(false)} />
      )}
    </div>
  );
}
