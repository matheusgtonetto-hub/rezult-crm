import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { toast } from "sonner";

type Screen = "login" | "signup" | "confirm";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [screen, setScreen] = useState<Screen>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

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
    // session listener in AuthContext handles redirect automatically
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPwd) { toast.error("Preencha todos os campos."); return; }
    if (password !== confirmPwd) { toast.error("As senhas não coincidem."); return; }
    if (password.length < 6) { toast.error("A senha deve ter pelo menos 6 caracteres."); return; }
    setLoading(true);
    const { error, needsConfirmation } = await signUp(email, password);
    setLoading(false);
    if (error) { toast.error(error); return; }
    if (needsConfirmation) setScreen("confirm");
  };

  if (screen === "confirm") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
        <div
          className="w-full max-w-[420px] bg-card rounded-2xl p-10 text-center"
          style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12)" }}
        >
          <div className="flex justify-center mb-6">
            <Logo size="md" showIcon />
          </div>
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck size={28} className="text-primary" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-foreground">Confirme seu e-mail</h1>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Enviamos um link de confirmação para <strong>{email}</strong>.
            <br />
            Abra o e-mail e clique no link para ativar sua conta.
          </p>
          <Button
            variant="outline"
            className="w-full h-11 rounded-lg mt-8"
            onClick={() => setScreen("login")}
          >
            Voltar para o login
          </Button>
        </div>
      </div>
    );
  }

  const isLogin = screen === "login";

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
      <div
        className="w-full max-w-[420px] bg-card rounded-2xl p-10"
        style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)" }}
      >
        <div className="flex justify-center mb-6">
          <Logo size="md" showIcon />
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center">
          {isLogin ? "Bem-vindo" : "Criar conta"}
        </h1>
        <p className="text-sm text-muted-foreground text-center mt-2">
          {isLogin
            ? "Acesse sua conta e gerencie seu comercial com inteligência"
            : "Preencha os dados abaixo para começar"}
        </p>

        <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4 mt-8">
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
                autoComplete={isLogin ? "current-password" : "new-password"}
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

          {!isLogin && (
            <div className="space-y-1.5">
              <Label htmlFor="confirmPwd" className="text-xs font-medium">Confirmar senha</Label>
              <Input
                id="confirmPwd"
                type={showPwd ? "text" : "password"}
                placeholder="••••••"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                className="h-11 rounded-lg"
                autoComplete="new-password"
              />
            </div>
          )}

          {isLogin && (
            <div className="flex justify-end">
              <button type="button" className="text-xs text-primary hover:underline font-medium">
                Recuperar senha
              </button>
            </div>
          )}

          <Button type="submit" className="w-full h-12 rounded-lg font-semibold" disabled={loading}>
            {loading ? "Aguarde..." : isLogin ? "Entrar" : "Criar conta"}
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
            onClick={() => { setScreen(isLogin ? "signup" : "login"); setPassword(""); setConfirmPwd(""); }}
          >
            {isLogin ? "Criar uma conta" : "Já tenho uma conta"}
          </Button>
        </form>
      </div>
    </div>
  );
}
