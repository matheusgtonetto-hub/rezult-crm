import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, MailCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useIdioma } from "@/context/IdiomaContext";
import { SeletorDeIdioma } from "@/components/SeletorDeIdioma";

type Screen = "login" | "forgot";

/**
 * Para onde vai o "Agendar demonstração".
 *
 * Em constante porque é decisão de negócio, não de tela: hoje leva à conversa
 * com o time no WhatsApp, e no dia em que existir uma agenda pública (Calendly,
 * Cal.com) troca-se a linha, sem procurar o link no meio do JSX.
 *
 * A mensagem já vai escrita para o atendente saber de onde veio o contato, e
 * porque quem clica em "agendar" não deveria precisar redigir nada.
 */
const LINK_DEMONSTRACAO =
  `https://wa.me/554891160449?text=${encodeURIComponent("Olá! Gostaria de agendar uma demonstração do Rezult CRM.")}`;

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

  if (screen === "forgot") {
    return (
      <div className="relative h-screen overflow-hidden flex items-center justify-center px-4" style={{ background: "#F2F7F5" }}>
        {/* Preso ao canto da tela, fora do cartão: a escolha vale para a página
            inteira, e dentro do cartão ela viraria mais um campo do
            formulário. `absolute` sobre o `relative` do fundo. */}
        <div className="absolute top-5 right-5 z-10"><SeletorDeIdioma /></div>
        <div
          className="w-full max-w-[380px] bg-card rounded-lg p-[30px] text-center border border-gray-300"
                  >
          <div className="flex justify-center mb-6"><img src="/logo-rezult.png?v=2" alt="Rezult CRM" className="h-10 w-auto" /></div>

          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck size={28} className="text-primary" />
            </div>
          </div>

          {forgotSent ? (
            <>
              <h1 className="text-xl font-bold text-foreground">{t("senha.enviadoTitulo")}</h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                {t("senha.enviadoPara")} <strong>{forgotEmail}</strong>.
                <br />{t("senha.enviadoInstrucao")}
              </p>
              <Button
                className="w-full h-auto py-[10px] rounded-[5px] font-semibold mt-8"
                onClick={() => setScreen("login")}
              >
                {t("senha.voltar")}
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground">{t("senha.titulo")}</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {t("senha.descricao")}
              </p>

              <form onSubmit={handleForgot} className="space-y-4 mt-8 text-left">
                <div className="space-y-[3px]">
                  <Label htmlFor="forgot-email" className="text-[13px] font-normal text-black">{t("login.email")}</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder={t("login.emailPlaceholder")}
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    autoFocus
                  />
                </div>

                <Button type="submit" className="w-full h-auto py-[10px] rounded-[5px] font-semibold" disabled={forgotLoading}>
                  {forgotLoading ? t("senha.enviando") : t("senha.enviar")}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-auto py-[10px] rounded-[5px]"
                  onClick={() => setScreen("login")}
                >
                  {t("senha.voltar")}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  // `flex-col`: o cartão e a chamada de demonstração são dois blocos
  // empilhados. Em linha, que era como estava, o segundo ia parar ao LADO do
  // cartão. O seletor continua absoluto no canto, fora dessa coluna.
  return (
    <div className="relative h-screen overflow-hidden flex flex-col items-center justify-center px-4" style={{ background: "#F2F7F5" }}>
      <div className="absolute top-5 right-5 z-10"><SeletorDeIdioma /></div>
      <div className="relative w-full max-w-[380px] rounded-[7px] p-[1px] overflow-hidden">
        {/* Rotating border lights */}
        <div
          className="absolute inset-[-100%]"
          style={{
            background: "conic-gradient(from 0deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
            animation: "spin-border 4s linear infinite",
          }}
        />
        <div
          className="absolute inset-[-100%]"
          style={{
            background: "conic-gradient(from 180deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
            animation: "spin-border 4s linear infinite",
          }}
        />
        <div
        className="relative w-full bg-card rounded-[7px] p-[30px]"
              >
        <div className="flex justify-center items-center mb-[15px]">
          <img src="/logo-rezult.png?v=2" alt="Rezult CRM" className="h-10 w-auto" />
        </div>

        {emailConfirmed && (
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 shrink-0" />
            <p className="text-sm text-green-800 leading-snug">
              <span className="font-semibold">{t("login.emailConfirmadoTitulo")}</span>
              <br />{t("login.emailConfirmadoTexto")}
            </p>
          </div>
        )}

        <h1 className="text-[23px] text-foreground text-center" style={{ fontFamily: "'Geist Sans', sans-serif", fontWeight: 700, letterSpacing: "-0.2px" }}>{t("login.titulo")}</h1>
        <p className="text-[15px] text-gray-500 text-center mt-[1px]" style={{ fontWeight: 400 }}>
          {t("login.subtitulo")}
        </p>

        <form onSubmit={handleLogin} className="space-y-3 mt-[15px]">
          <div className="space-y-[3px]">
            <Label htmlFor="email" className="text-[13px] font-normal text-black">{t("login.email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("login.emailPlaceholder")}
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              autoComplete="email"
            />
          </div>

          <div className="space-y-[3px]">
            <Label htmlFor="password" className="text-[13px] font-normal text-black">{t("login.senha")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder={t("login.senhaPlaceholder")}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-auto rounded-[5px] pr-10 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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

          <div className="flex justify-end">
            <button
              type="button"
              onClick={openForgot}
              className="text-xs text-primary hover:underline font-medium"
            >
              {t("login.recuperarSenha")}
            </button>
          </div>

          <Button type="submit" className="w-full h-auto py-[10px] rounded-[5px] font-semibold" disabled={loading}>
            {loading ? t("login.aguarde") : t("login.entrar")}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full h-auto py-[10px] rounded-[5px] font-medium bg-white border border-primary text-primary hover:bg-primary/5 hover:text-primary active:bg-primary/10 transition-colors"
            onClick={() => navigate("/register")}
          >
            {t("login.criarConta")}
          </Button>
        </form>
        </div>
      </div>

      {/* Fora do cartão, com o mesmo teto de largura dele: dentro, viraria mais
          uma opção do formulário, competindo com "Entrar" e "Criar uma conta".
          Aqui embaixo é convite, não caminho de acesso. */}
      {/* O botão vive DENTRO do parágrafo, e não numa coluna ao lado: assim ele
          entra no fluxo do texto, logo depois do ponto final, e desce para a
          linha seguinte junto com a frase quando não couber. */}
      <div className="w-full max-w-[380px] mt-5 text-center">
        <p className="text-[13px] font-medium text-foreground leading-relaxed">
          {t("demo.texto")}{" "}
        {/* Contorno verde com fundo transparente: o botão sólido do
            formulário é a ação principal da tela, e um segundo botão cheio aqui
            embaixo disputaria a mesma atenção. No hover o fundo ganha só um véu
            do próprio verde, então a cor do texto e da borda não muda. */}
        <a
          href={LINK_DEMONSTRACAO}
          target="_blank"
          rel="noopener noreferrer"
          // `align-middle` porque um inline-flex no meio do texto assenta na
          // linha de base por padrão, e o botão ficaria com a borda inferior
          // afundada em relação à frase.
          className="inline-flex align-middle items-center justify-center border border-primary bg-transparent text-[11px] font-semibold text-primary transition-colors hover:bg-primary/5"
          style={{ borderRadius: 30, padding: "1px 10px" }}
        >
          {t("demo.botao")}
        </a>
        </p>
      </div>
    </div>
  );
}
