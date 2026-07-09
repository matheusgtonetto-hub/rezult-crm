import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Aplica o tema salvo ANTES de renderizar — evita flash e mantém o escuro no refresh
try {
  if (localStorage.getItem("theme") === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch { /* ignore */ }

createRoot(document.getElementById("root")!).render(<App />);
