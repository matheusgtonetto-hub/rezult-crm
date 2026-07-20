import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { pixelTrack } from "@/lib/metaPixel";

const TURNSTILE_SITEKEY = "0x4AAAAAD5X6YCBBdCfHFJG";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
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
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const renderWidget = () => {
      if (!turnstileRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITEKEY,
        theme: "light",
        language: "pt-BR",
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else if (!document.getElementById("turnstile-script")) {
      const script = document.createElement("script");
      script.id = "turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__turnstile_onload";
      script.async = true;
      script.defer = true;
      (window as Record<string, unknown>).__turnstile_onload = renderWidget;
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) { clearInterval(interval); renderWidget(); }
      }, 100);
      return () => clearInterval(interval);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
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
    if (!turnstileToken) { toast.error("Complete a verificação de segurança."); return; }

    setLoading(true);

    // Validação server-side do Turnstile
    const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-turnstile", {
      body: { token: turnstileToken },
    });
    if (verifyError || !verifyData?.success) {
      toast.error("Verificação de segurança inválida. Tente novamente.");
      setLoading(false);
      setTurnstileToken("");
      if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
      return;
    }

    const { error, needsConfirmation, resentConfirmation } = await signUp(email, password, fullName.trim());
    setLoading(false);

    if (error) {
      toast.error(error);
      return;
    }

    pixelTrack("Lead");

    if (!needsConfirmation) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_name")
        .eq("email", email.toLowerCase())
        .maybeSingle();
      navigate(profile?.company_name ? "/dashboard" : "/company-register");
      return;
    }

    sessionStorage.setItem("register_email", email);

    if (resentConfirmation) {
      toast.info("Reenviamos o link de confirmação para o seu e-mail. Verifique sua caixa de entrada.");
    }

    navigate("/verify-2fa", { state: { email } });
  };

  return (
    <div className="h-screen overflow-y-auto flex items-center justify-center px-4 py-6" style={{ background: "#EFF5F2" }}>
      <div className="relative w-full max-w-[380px] rounded-[7px] p-[1px] overflow-hidden">
        {/* Rotating border light */}
        <div
          className="absolute inset-[-100%]"
          style={{
            background: "conic-gradient(from 0deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
            animation: "spin-border 4s linear infinite",
          }}
        />
        <div className="relative w-full bg-card rounded-[7px] px-[30px] pt-[30px] pb-[20px]">
          <div className="flex justify-center items-center mb-[15px]">
            <Logo size="md" showIcon />
          </div>

          <h1 className="text-[23px] font-semibold text-foreground text-center">Crie sua conta</h1>
          <p className="text-[15px] text-gray-500 text-center mt-[1px]" style={{ fontWeight: 600 }}>
            Preencha os dados abaixo para começar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3 mt-[15px]">
            <div className="space-y-[3px]">
              <Label htmlFor="fullName" className="text-[13px] font-normal text-black">Nome completo</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Seu nome completo"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                autoComplete="name"
                autoFocus
              />
            </div>

            <div className="space-y-[3px]">
              <Label htmlFor="reg-email" className="text-[13px] font-normal text-black">E-mail</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="email@gmail.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                autoComplete="email"
              />
            </div>

            <div className="space-y-[3px]">
              <Label htmlFor="reg-password" className="text-[13px] font-normal text-black">Senha</Label>
              <div className="relative">
                <Input
                  id="reg-password"
                  type={showPwd ? "text" : "password"}
                  placeholder="Insira sua senha"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-auto rounded-[5px] pr-10 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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

            <div className="space-y-[3px]">
              <Label htmlFor="reg-confirm" className="text-[13px] font-normal text-black">Confirmar senha</Label>
              <div className="relative">
                <Input
                  id="reg-confirm"
                  type={showConfirmPwd ? "text" : "password"}
                  placeholder="Repita sua senha"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  className="h-auto rounded-[5px] pr-10 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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

            <div className="flex justify-center">
              <div ref={turnstileRef} />
            </div>

            <div className="space-y-[5px]">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={agreedTos}
                  onChange={e => setAgreedTos(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer"
                />
                <span className="text-[12px] text-muted-foreground leading-snug group-hover:text-foreground transition-colors">
                  Li e concordo com os{" "}
                  <a
                    href="https://www.rezultcrm.com/termo"
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
                <span className="text-[12px] text-muted-foreground leading-snug group-hover:text-foreground transition-colors">
                  Li e concordo com a{" "}
                  <a
                    href="https://www.rezultcrm.com/politica"
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

            <Button
              type="submit"
              className="w-full h-auto py-[10px] rounded-[5px] font-semibold"
              disabled={loading || !fullName.trim() || !email.trim() || !password || !confirmPwd || !agreedTos || !agreedPrivacy || !turnstileToken}
            >
              {loading ? "Criando conta..." : "Começar teste grátis"}
            </Button>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-[13px] text-primary hover:text-primary/80 transition-colors"
              >
                Voltar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
