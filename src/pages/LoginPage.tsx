import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, MailCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useIdioma } from "@/context/IdiomaContext";
import { LayoutDeEntrada } from "@/components/entrada/LayoutDeEntrada";
import { MarcaRezult } from "@/components/MarcaRezult";

type Screen = "login" | "forgot";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, resetPassword } = useAuth();
  const { t } = useIdioma();

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
    if (!email || !password) { toast.error(t("login.erroCamposVazios")); return; }
    setLoading(true);
    const error = await signIn(email, password);
    setLoading(false);
    if (error) {
      if (error.toLowerCase().includes("email not confirmed")) {
        toast.error(t("login.erroEmailNaoConfirmado"));
      } else if (error.toLowerCase().includes("invalid login")) {
        toast.error(t("login.erroCredenciais"));
      } else {
        toast.error(error);
      }
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) { toast.error(t("senha.erroEmailVazio")); return; }
    setForgotLoading(true);
    const error = await resetPassword(forgotEmail.trim());
    setForgotLoading(false);
    if (error) { toast.error(t("senha.erroEnvio")); return; }
    setForgotSent(true);
  };

  // As duas telas (entrar e recuperar senha) moram na mesma casca. Ao abrir a
  // recuperação, o painel da direita não se mexe: só a coluna do formulário
  // troca, e a pessoa entende que continua no mesmo lugar.
  if (screen === "forgot") {
    return (
      <LayoutDeEntrada>
        <div className="mb-10"><MarcaRezult /></div>

        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
          <MailCheck size={28} className="text-primary" />
        </div>

        {forgotSent ? (
          <>
            <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.015em] text-foreground">{t("senha.enviadoTitulo")}</h1>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              {t("senha.enviadoPara")} <strong>{forgotEmail}</strong>.
              <br />{t("senha.enviadoInstrucao")}
            </p>
            <Button
              className="w-full h-[var(--control-h-lg)] font-semibold mt-8"
              onClick={() => setScreen("login")}
            >
              {t("senha.voltar")}
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.015em] text-foreground">{t("senha.titulo")}</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {t("senha.descricao")}
            </p>

            <form onSubmit={handleForgot} className="space-y-4 mt-8">
              <div className="space-y-[3px]">
                <Label htmlFor="forgot-email" className="text-[13px] font-normal text-foreground">{t("login.email")}</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder={t("login.emailPlaceholder")}
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  className="focus-visible:border-primary"
                  autoFocus
                />
              </div>

              <Button type="submit" className="w-full h-[var(--control-h-lg)] font-semibold" disabled={forgotLoading}>
                {forgotLoading ? t("senha.enviando") : t("senha.enviar")}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-[var(--control-h-lg)]"
                onClick={() => setScreen("login")}
              >
                {t("senha.voltar")}
              </Button>
            </form>
          </>
        )}
      </LayoutDeEntrada>
    );
  }

  return (
    <LayoutDeEntrada>
      <div className="mb-10"><MarcaRezult /></div>

      {emailConfirmed && (
        <div className="flex items-start gap-3 bg-[color:var(--accent-50)] border border-[color:var(--accent-200)] rounded-xl px-4 py-3 mb-6">
          <CheckCircle2 size={18} className="text-[color:var(--accent-700)] mt-0.5 shrink-0" />
          <p className="text-sm text-[color:var(--accent-800)] leading-snug">
            <span className="font-semibold">{t("login.emailConfirmadoTitulo")}</span>
            <br />{t("login.emailConfirmadoTexto")}
          </p>
        </div>
      )}

      <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.015em] text-foreground">{t("login.titulo")}</h1>
      <p className="text-[14px] text-muted-foreground mt-1" style={{ fontWeight: 400 }}>
        {t("login.subtitulo")}
      </p>

      <form onSubmit={handleLogin} className="space-y-4 mt-8">
        <div className="space-y-[3px]">
          <Label htmlFor="email" className="text-[13px] font-normal text-foreground">{t("login.email")}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t("login.emailPlaceholder")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="focus-visible:border-primary"
            autoComplete="email"
          />
        </div>

        {/* O link de recuperar a senha mora colado no campo de senha, e não
            solto entre ele e o botão: é uma ação DO campo. Por isso os dois
            dividem um bloco com respiro menor que o do resto do formulário. */}
        <div className="space-y-2">
          <div className="space-y-[3px]">
            <Label htmlFor="password" className="text-[13px] font-normal text-foreground">{t("login.senha")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder={t("login.senhaPlaceholder")}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pr-10 focus-visible:border-primary"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPwd ? t("login.ocultarSenha") : t("login.mostrarSenha")}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={openForgot}
            className="block text-[13px] text-primary hover:underline font-medium"
          >
            {t("login.recuperarSenha")}
          </button>
        </div>

        <Button type="submit" className="w-full h-[var(--control-h-lg)] font-semibold" disabled={loading}>
          {loading ? t("login.aguarde") : t("login.entrar")}
        </Button>

        {/* No lugar onde a referência separa o "Entrar" do login com o Google.
            Aqui separa de "Criar conta": são os dois caminhos de quem chega. */}
        <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t("login.ou")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full h-[var(--control-h-lg)] font-medium bg-card border border-primary text-primary hover:bg-success-soft hover:text-primary active:brightness-[0.97] transition-colors"
          onClick={() => navigate("/register")}
        >
          {t("login.criarConta")}
        </Button>
      </form>
    </LayoutDeEntrada>
  );
}
