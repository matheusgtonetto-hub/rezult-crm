import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, MailCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Screen = "login" | "forgot";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, resetPassword } = useAuth();

  const [screen, setScreen]             = useState<Screen>("login");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPwd, setShowPwd]           = useState(false);
  const [loading, setLoading]           = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("email_confirmed")) {
      sessionStorage.removeItem("email_confirmed");
      setEmailConfirmed(true);
    }
  }, []);

  const [forgotEmail, setForgotEmail]     = useState("");
  const [forgotSent, setForgotSent]       = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const openForgot = () => {
    setForgotEmail(email);
    setForgotSent(false);
    setScreen("forgot");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Preencha todos os campos."); return; }
    setLoading(true);
    const error = await signIn(email, password);
    setLoading(false);
    if (error) {
      if (error.toLowerCase().includes("email not confirmed")) {
        toast.error("Confirme seu e-mail antes de entrar.");
      } else if (error.toLowerCase().includes("invalid login")) {
        toast.error("E-mail ou senha incorretos.");
      } else {
        toast.error(error);
      }
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) { toast.error("Informe seu e-mail."); return; }
    setForgotLoading(true);
    const error = await resetPassword(forgotEmail.trim());
    setForgotLoading(false);
    if (error) { toast.error("Não foi possível enviar o link. Verifique o e-mail informado."); return; }
    setForgotSent(true);
  };

  if (screen === "forgot") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
        <div
          className="w-full max-w-[420px] bg-card rounded-2xl p-10 text-center"
          style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)" }}
        >
          <div className="flex justify-center mb-6"><Logo size="md" showIcon /></div>

          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck size={28} className="text-primary" />
            </div>
          </div>

          {forgotSent ? (
            <>
              <h1 className="text-xl font-bold text-foreground">E-mail enviado!</h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                Enviamos um link de recuperação para <strong>{forgotEmail}</strong>.
                <br />Verifique sua caixa de entrada e clique no link para redefinir sua senha.
              </p>
              <Button
                className="w-full h-12 rounded-lg font-semibold mt-8"
                onClick={() => setScreen("login")}
              >
                Voltar para o login
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground">Recuperar senha</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>

              <form onSubmit={handleForgot} className="space-y-4 mt-8 text-left">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email" className="text-xs font-medium">E-mail</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    className="h-11 rounded-lg"
                    autoFocus
                  />
                </div>

                <Button type="submit" className="w-full h-12 rounded-lg font-semibold" disabled={forgotLoading}>
                  {forgotLoading ? "Enviando..." : "Enviar link de recuperação"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 rounded-lg"
                  onClick={() => setScreen("login")}
                >
                  Voltar para o login
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
      <div
        className="w-full max-w-[420px] bg-card rounded-2xl p-10"
        style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)" }}
      >
        <div className="flex justify-center mb-6"><Logo size="md" showIcon /></div>

        {emailConfirmed && (
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 shrink-0" />
            <p className="text-sm text-green-800 leading-snug">
              <span className="font-semibold">E-mail confirmado com sucesso!</span>
              <br />Faça login para continuar.
            </p>
          </div>
        )}

        <h1 className="text-2xl font-bold text-foreground text-center">Bem-vindo</h1>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Acesse sua conta e gerencie seu comercial com inteligência
        </p>

        <form onSubmit={handleLogin} className="space-y-4 mt-8">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="exemplo@gmail.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-11 rounded-lg"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder="••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-11 rounded-lg pr-10"
                autoComplete="current-password"
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

          <div className="flex justify-end">
            <button
              type="button"
              onClick={openForgot}
              className="text-xs text-primary hover:underline font-medium"
            >
              Recuperar senha
            </button>
          </div>

          <Button type="submit" className="w-full h-12 rounded-lg font-semibold" disabled={loading}>
            {loading ? "Aguarde..." : "Entrar"}
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-lg font-medium border-card-border text-foreground"
            onClick={() => navigate("/register")}
          >
            Criar uma conta
          </Button>
        </form>
      </div>
    </div>
  );
}
