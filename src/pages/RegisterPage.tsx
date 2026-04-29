import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

// Replace with your real Cloudflare Turnstile sitekey when available
const TURNSTILE_SITEKEY = "0x4AAAAAAA_PLACEHOLDER";

declare global {
  interface Window {
    __turnstile_register_cb?: (token: string) => void;
  }
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [agreedTos, setAgreedTos] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Register Turnstile callback and load script once
  useEffect(() => {
    window.__turnstile_register_cb = () => {};

    if (!document.getElementById("turnstile-script")) {
      const script = document.createElement("script");
      script.id = "turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      delete window.__turnstile_register_cb;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { toast.error("Informe seu nome completo."); return; }
    if (!email) { toast.error("Informe seu e-mail."); return; }
    if (password.length < 6) { toast.error("A senha deve ter pelo menos 6 caracteres."); return; }
    if (password !== confirmPwd) { toast.error("As senhas não coincidem."); return; }
    if (!agreedTos) { toast.error("Você precisa aceitar os Termos de Serviço."); return; }
    if (!agreedPrivacy) { toast.error("Você precisa aceitar a Política de Privacidade."); return; }

    setLoading(true);
    const { error, needsConfirmation, resentConfirmation } = await signUp(email, password, fullName.trim());
    setLoading(false);

    if (error) {
      toast.error(error);
      return;
    }

    // Supabase "Confirm email" disabled — user auto-confirmed, go straight to onboarding.
    if (!needsConfirmation) {
      navigate("/company-register");
      return;
    }

    sessionStorage.setItem("register_email", email);

    if (resentConfirmation) {
      // Account already exists but was unconfirmed — we resent the confirmation link.
      toast.info("Reenviamos o link de confirmação para o seu e-mail. Verifique sua caixa de entrada.");
    }

    navigate("/verify-2fa", { state: { email } });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "#F0F4F8" }}
    >
      <div
        className="w-full max-w-[460px] bg-card rounded-2xl p-10"
        style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)" }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Logo size="md" showIcon />
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center">Criar sua conta</h1>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Preencha os dados abaixo para começar
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-8">
          {/* Nome completo */}
          <div className="space-y-1.5">
            <Label htmlFor="fullName" className="text-xs font-medium">Nome completo</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="João Silva"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="h-11 rounded-lg"
              autoComplete="name"
              autoFocus
            />
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <Label htmlFor="reg-email" className="text-xs font-medium">E-mail</Label>
            <Input
              id="reg-email"
              type="email"
              placeholder="joao@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-11 rounded-lg"
              autoComplete="email"
            />
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <Label htmlFor="reg-password" className="text-xs font-medium">Senha</Label>
            <div className="relative">
              <Input
                id="reg-password"
                type={showPwd ? "text" : "password"}
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-11 rounded-lg pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirmar senha */}
          <div className="space-y-1.5">
            <Label htmlFor="reg-confirm" className="text-xs font-medium">Confirmar senha</Label>
            <div className="relative">
              <Input
                id="reg-confirm"
                type={showConfirmPwd ? "text" : "password"}
                placeholder="Repita a senha"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                className="h-11 rounded-lg pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showConfirmPwd ? "Ocultar senha" : "Mostrar senha"}
              >
                {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Cloudflare Turnstile */}
          <div className="flex justify-center py-1">
            <div
              className="cf-turnstile"
              data-sitekey={TURNSTILE_SITEKEY}
              data-callback="__turnstile_register_cb"
              data-theme="light"
              data-language="pt-BR"
            />
          </div>

          {/* Terms checkboxes */}
          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedTos}
                onChange={e => setAgreedTos(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer"
              />
              <span className="text-sm text-muted-foreground leading-snug group-hover:text-foreground transition-colors">
                Li e concordo com os{" "}
                <a
                  href="https://datacrazy.io/termos"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-primary hover:underline font-medium"
                >
                  Termos de Serviço
                </a>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedPrivacy}
                onChange={e => setAgreedPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer"
              />
              <span className="text-sm text-muted-foreground leading-snug group-hover:text-foreground transition-colors">
                Li e concordo com a{" "}
                <a
                  href="https://datacrazy.io/politica-de-privacidade"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-primary hover:underline font-medium"
                >
                  Política de Privacidade
                </a>
              </span>
            </label>
          </div>

          {/* Primary CTA */}
          <Button
            type="submit"
            className="w-full h-12 rounded-lg font-semibold mt-2"
            disabled={loading}
          >
            {loading ? "Criando conta..." : "Criar sua conta"}
          </Button>

          {/* Back */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 rounded-lg font-medium border-card-border"
            onClick={() => navigate("/")}
          >
            Voltar
          </Button>
        </form>
      </div>
    </div>
  );
}
