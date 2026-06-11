import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

export default function Verify2FAPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { resendConfirmation } = useAuth();

  const email =
    (location.state as { email?: string } | null)?.email ??
    sessionStorage.getItem("register_email") ??
    "";

  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!email) { toast.error("E-mail não encontrado. Volte e tente novamente."); return; }
    setResending(true);
    await resendConfirmation(email);
    setResending(false);
    toast.success(`Link de confirmação reenviado para ${email}`);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#F0F4F8" }}
    >
      <div
        className="w-full max-w-[420px] bg-card rounded-2xl p-10 text-center"
        style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)" }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <Logo size="md" showIcon />
        </div>

<h1 className="text-[23px] font-semibold text-foreground">Verifique seu e-mail</h1>

        <p className="text-[17px] font-normal text-muted-foreground mt-[5px] leading-[1.3]">
          Enviamos um link de confirmação para o seu e-mail.{" "}
          Clique no link para confirmar seu cadastro e continuar.
        </p>

        {email && (
          <p className="text-sm font-semibold text-foreground mt-2">{email}</p>
        )}

        <Button
          className="w-full h-12 rounded-lg font-semibold mt-8"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? "Reenviando..." : "Reenviar link de confirmação"}
        </Button>

        <p className="mt-5">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            Voltar para o login
          </button>
        </p>
      </div>
    </div>
  );
}
