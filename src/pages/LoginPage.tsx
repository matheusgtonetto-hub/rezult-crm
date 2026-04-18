import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { login } = useCRM();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha todos os campos.");
      return;
    }
    toast.success("Login realizado com sucesso!");
    login();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
      <div
        className="w-full max-w-[420px] bg-card rounded-2xl p-10"
        style={{ boxShadow: "0 8px 32px -8px rgba(15, 23, 42, 0.12), 0 2px 8px -2px rgba(15, 23, 42, 0.06)" }}
      >
        <div className="flex justify-center mb-6">
          <Logo size="md" showIcon />
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center">Bem-vindo</h1>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Acesse sua conta e gerencie seu comercial com inteligência
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-8">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="exemplo@gmail.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-11 rounded-lg"
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
            <button type="button" className="text-xs text-primary hover:underline font-medium">
              Recuperar senha
            </button>
          </div>

          <Button type="submit" className="w-full h-12 rounded-lg font-semibold">
            Entrar
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
          >
            Registre-se
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-lg font-medium border-card-border text-foreground gap-2"
          >
            <GoogleIcon />
            Entrar com Google
          </Button>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
