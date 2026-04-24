import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { useCRM } from "@/context/CRMContext";

export default function AppLayout() {
  const { crmLoading } = useCRM();

  if (crmLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0F4F8" }}>
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

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
        }}
      >
        <div style={{ width: "100%", height: "100%", boxSizing: "border-box" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
