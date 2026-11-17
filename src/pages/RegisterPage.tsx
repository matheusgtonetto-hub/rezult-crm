import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { LayoutDeEntrada } from "@/components/entrada/LayoutDeEntrada";
import { useIdioma } from "@/context/IdiomaContext";
import { pixelTrack } from "@/lib/metaPixel";
import { capturarAtribuicao } from "@/lib/atribuicao";
import { MarcaRezult } from "@/components/MarcaRezult";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { t } = useIdioma();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  // Guarda UTM e fbclid que o site repassou no link do CTA. A empresa só nasce
  // duas telas depois, em /company-register; sem guardar aqui, a origem se perde
  // no caminho. Ver lib/atribuicao.ts.
  useEffect(() => {
    capturarAtribuicao();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { toast.error(t("cadastro.erroNome")); return; }
    if (!email) { toast.error(t("cadastro.erroEmail")); return; }
    if (password.length < 6) { toast.error(t("cadastro.erroSenhaCurta")); return; }
    if (password !== confirmPwd) { toast.error(t("cadastro.erroSenhasDiferentes")); return; }

    setLoading(true);

    const { error, needsConfirmation, resentConfirmation } = await signUp(email, password, fullName.trim());
    setLoading(false);

    if (error) {
      // A sentinela do AuthContext vira frase no idioma da tela e leva ao
      // login com o e-mail já preenchido; qualquer outro erro é do Supabase e
      // vai como veio, para não esconder o motivo real.
      if (error === "EMAIL_JA_CADASTRADO") {
        toast.error(t("cadastro.emailJaCadastrado"));
        navigate("/");
        return;
      }
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
      navigate(profile?.company_name ? "/inicio" : "/company-register");
      return;
    }

    sessionStorage.setItem("register_email", email);

    if (resentConfirmation) {
      toast.info(t("cadastro.reenviamos"));
    }

    navigate("/verify-2fa", { state: { email } });
  };

  return (
    <LayoutDeEntrada
      // Seta no canto da página, e não um botão no fim do formulário: voltar é
      // saída, não conclusão, e no rodapé ela dividia atenção com o botão de
      // criar a conta. Vai no cabeçalho da casca, que é onde o idioma e o tema
      // também ficam, para a seta não empurrar a logo para o lado.
      //
      // Só o desenho, sem texto: a seta para a esquerda no alto de uma tela já
      // é lida como "voltar" em qualquer idioma, e o nome completo vai no
      // `aria-label`, para quem usa leitor de tela.
      voltar={
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label={t("cadastro.voltar")}
          title={t("cadastro.voltar")}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </button>
      }
    >
      <div className="mb-10"><MarcaRezult /></div>

      <h1 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.015em] text-foreground">{t("cadastro.titulo")}</h1>
      <p className="text-[14px] text-muted-foreground mt-1" style={{ fontWeight: 400 }}>
        {t("cadastro.subtitulo")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 mt-8">
        <div className="space-y-[3px]">
          <Label htmlFor="fullName" className="text-[13px] font-normal text-foreground">{t("cadastro.nome")}</Label>
          <Input
            id="fullName"
            type="text"
            placeholder={t("cadastro.nomePlaceholder")}
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="focus-visible:border-primary"
            autoComplete="name"
            autoFocus
          />
        </div>

        <div className="space-y-[3px]">
          <Label htmlFor="reg-email" className="text-[13px] font-normal text-foreground">{t("login.email")}</Label>
          <Input
            id="reg-email"
            type="email"
            placeholder={t("login.emailPlaceholder")}
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="focus-visible:border-primary"
            autoComplete="email"
          />
        </div>

        <div className="space-y-[3px]">
          <Label htmlFor="reg-password" className="text-[13px] font-normal text-foreground">{t("login.senha")}</Label>
          <div className="relative">
            <Input
              id="reg-password"
              type={showPwd ? "text" : "password"}
              placeholder={t("login.senhaPlaceholder")}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="pr-10 focus-visible:border-primary"
              autoComplete="new-password"
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

        <div className="space-y-[3px]">
          <Label htmlFor="reg-confirm" className="text-[13px] font-normal text-foreground">{t("cadastro.confirmarSenha")}</Label>
          <div className="relative">
            <Input
              id="reg-confirm"
              type={showConfirmPwd ? "text" : "password"}
              placeholder={t("cadastro.confirmarPlaceholder")}
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              className="pr-10 focus-visible:border-primary"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPwd(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showConfirmPwd ? t("login.ocultarSenha") : t("login.mostrarSenha")}
            >
              {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Consentimento pelo ato de criar a conta, sem caixa para marcar.
            O texto é o aceite: quem clica no botão está concordando, e é
            por isso que ele vem logo acima dele, e não perdido no meio do
            formulário. */}
        <p className="text-[12px] text-muted-foreground leading-snug">
          {t("cadastro.consentimento")}{" "}
          <a
            href="https://www.rezultcrm.com/politica"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {t("cadastro.politica")}
          </a>
          .
        </p>

        <Button
          type="submit"
          className="w-full h-[var(--control-h-lg)] font-semibold"
          disabled={loading || !fullName.trim() || !email.trim() || !password || !confirmPwd}
        >
          {loading ? t("cadastro.criando") : t("cadastro.botao")}
        </Button>
      </form>
    </LayoutDeEntrada>
  );
}
