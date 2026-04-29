import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound, MailCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Mode = "form" | "expired" | "sent";

export default function ResetPasswordPage() {
  const navigate    = useNavigate();
  const { signOut, resetPassword } = useAuth();

  const [mode, setMode]           = useState<Mode>("form");
  const [password, setPassword]   = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);

  // For re-requesting a new link from the expired screen
  const [reEmail, setReEmail]     = useState("");
  const [reLoading, setReLoading] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("error")) {
      setMode("expired");
      // Clean the ugly hash from the URL bar
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6)    { toast.error("A senha deve ter pelo menos 6 caracteres."); return; }
    if (password !== confirmPwd) { toast.error("As senhas não coincidem."); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error("Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.");
      setMode("expired");
      return;
    }

    toast.success("Senha redefinida com sucesso!");
    await signOut();
    navigate("/", { replace: true });
  };

  const handleReRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reEmail.trim()) { toast.error("Informe seu e-mail."); return; }
    setReLoading(true);
    const err = await resetPassword(reEmail.trim());
    setReLoading(false);
    if (err) { toast.error("Não foi possível enviar o link. Verifique o e-mail informado."); return; }
    setMode("sent");
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F0F4F8" }}>
      <div
        className="w-full max-w-[420px] bg-card rounded-2xl p-10"
        style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)" }}
      >
        <div className="flex justify-center mb-6">
          <Logo size="md" showIcon />
        </div>
        {children}
      </div>
    </div>
  );

  if (mode === "expired") {
    return shell(
      <>
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle size={28} className="text-destructive" />
          </div>
        </div>

        <h1 className="text-xl font-bold text-foreground text-center">Link expirado</h1>
        <p className="text-sm text-muted-foreground text-center mt-2 leading-relaxed">
          Este link de recuperação já expirou ou foi utilizado.
          <br />Informe seu e-mail para receber um novo link.
        </p>

        <form onSubmit={handleReRequest} className="space-y-4 mt-8">
          <div className="space-y-1.5">
            <Label htmlFor="re-email" className="text-xs font-medium">E-mail da conta</Label>
            <Input
              id="re-email"
              type="email"
              placeholder="seu@email.com"
              value={reEmail}
              onChange={e => setReEmail(e.target.value)}
              className="h-11 rounded-lg"
              autoFocus
            />
          </div>

          <Button type="submit" className="w-full h-12 rounded-lg font-semibold" disabled={reLoading}>
            {reLoading ? "Enviando..." : "Enviar novo link"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 rounded-lg"
            onClick={() => navigate("/")}
          >
            Voltar para o login
          </Button>
        </form>
      </>
    );
  }

  if (mode === "sent") {
    return shell(
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <MailCheck size={28} className="text-primary" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-foreground">E-mail enviado!</h1>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          Enviamos um novo link de recuperação para <strong>{reEmail}</strong>.
          <br />Verifique sua caixa de entrada e clique no link.
        </p>
        <Button className="w-full h-12 rounded-lg font-semibold mt-8" onClick={() => navigate("/")}>
          Voltar para o login
        </Button>
      </div>
    );
  }

  return shell(
    <>
      <div className="flex justify-center mb-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <KeyRound size={28} className="text-primary" />
        </div>
      </div>

      <h1 className="text-xl font-bold text-foreground text-center">Definir nova senha</h1>
      <p className="text-sm text-muted-foreground text-center mt-2">
        Escolha uma senha segura para sua conta.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 mt-8">
        <div className="space-y-1.5">
          <Label htmlFor="new-pwd" className="text-xs font-medium">Nova senha</Label>
          <div className="relative">
            <Input
              id="new-pwd"
              type={showPwd ? "text" : "password"}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-11 rounded-lg pr-10"
              autoFocus
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

        <div className="space-y-1.5">
          <Label htmlFor="confirm-pwd" className="text-xs font-medium">Confirmar nova senha</Label>
          <Input
            id="confirm-pwd"
            type={showPwd ? "text" : "password"}
            placeholder="Repita a senha"
            value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)}
            className="h-11 rounded-lg"
            autoComplete="new-password"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 rounded-lg font-semibold mt-2"
          disabled={loading}
        >
          {loading ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>

      <p className="mt-5 text-center">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
        >
          Voltar para o login
        </button>
      </p>
    </>
  );
}
