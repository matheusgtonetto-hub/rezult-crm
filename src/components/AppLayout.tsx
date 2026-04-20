import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout() {
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
        <div style={{ width: "100%", boxSizing: "border-box" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
