import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { FreePlanBanner, BANNER_HEIGHT } from "@/components/FreePlanBanner";

// Routes where the user is actively completing onboarding — no redirect needed
const ONBOARDING_PATHS = ["/company-register", "/setup"];

export default function AppLayout() {
  const { crmLoading }                                                    = useCRM();
  const { company, companyLoading, planExpired, isFreePlan, planDaysLeft } = useCompany();
  const navigate                                                          = useNavigate();
  const { pathname }                                                      = useLocation();

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

  // Block access when free trial has expired — send to plan selection step
  useEffect(() => {
    if (!companyLoading && planExpired) {
      navigate("/setup", { state: { step: 3 }, replace: true });
    }
  }, [companyLoading, planExpired, navigate]);

  if (crmLoading || companyLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#F0F4F8" }}
      >
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const showBanner = isFreePlan && !planExpired && planDaysLeft !== null;

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
    </div>
  );
}
