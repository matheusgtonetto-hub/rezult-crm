import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SeletorDeIdioma } from "@/components/SeletorDeIdioma";
import { RodapeLegal } from "@/components/RodapeLegal";
import { useIdioma } from "@/context/IdiomaContext";
import { pixelTrack } from "@/lib/metaPixel";

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

  // Mesma coluna do login: cartão no bloco que cresce, rodapé no fim. Aqui o
  // container ainda rola, porque o formulário é alto -- e nesse caso o rodapé
  // aparece ao terminar de rolar, que é onde se espera encontrá-lo.
  return (
    <div className="relative h-screen overflow-y-auto flex flex-col px-4" style={{ background: "#F2F7F5" }}>
      {/* Mesmo canto do login: quem escolheu o idioma lá chega aqui pelo botão
          "Criar uma conta", e o seletor precisa continuar onde a pessoa
          acabou de vê-lo. */}
      <div className="absolute top-5 right-5 z-10"><SeletorDeIdioma /></div>
      <div className="flex-1 flex items-center justify-center py-6">
      <div className="relative w-full max-w-[380px] rounded-[7px] p-[1px] overflow-hidden shadow-elev-3">
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
        <div className="relative w-full bg-card rounded-[7px] px-[30px] pt-[30px] pb-[20px]">
          {/* Seta no canto, e não um botão no fim do formulário: voltar é saída,
              não conclusão, e no rodapé ela dividia atenção com o botão de
              criar a conta. `absolute` para não empurrar a logo do centro.

              Só o desenho, sem texto: a seta para a esquerda no alto de um
              formulário já é lida como "voltar" em qualquer idioma, e o nome
              completo vai no `aria-label`, para quem usa leitor de tela. */}
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label={t("cadastro.voltar")}
            title={t("cadastro.voltar")}
            className="absolute left-[18px] top-[22px] flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex justify-center items-center mb-[15px]">
            <img src="/logo-rezult.png?v=2" alt="Rezult CRM" className="h-10 w-auto" />
          </div>

          <h1 className="text-[23px] text-foreground text-center" style={{ fontFamily: "'Geist Sans', sans-serif", fontWeight: 700, letterSpacing: "-0.2px" }}>{t("cadastro.titulo")}</h1>
          <p className="text-[15px] text-gray-500 text-center mt-[1px]" style={{ fontWeight: 400 }}>
            {t("cadastro.subtitulo")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3 mt-[15px]">
            <div className="space-y-[3px]">
              <Label htmlFor="fullName" className="text-[13px] font-normal text-black">{t("cadastro.nome")}</Label>
              <Input
                id="fullName"
                type="text"
                placeholder={t("cadastro.nomePlaceholder")}
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                autoComplete="name"
                autoFocus
              />
            </div>

            <div className="space-y-[3px]">
              <Label htmlFor="reg-email" className="text-[13px] font-normal text-black">{t("login.email")}</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder={t("login.emailPlaceholder")}
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                autoComplete="email"
              />
            </div>

            <div className="space-y-[3px]">
              <Label htmlFor="reg-password" className="text-[13px] font-normal text-black">{t("login.senha")}</Label>
              <div className="relative">
                <Input
                  id="reg-password"
                  type={showPwd ? "text" : "password"}
                  placeholder={t("login.senhaPlaceholder")}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-auto rounded-[5px] pr-10 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
              <Label htmlFor="reg-confirm" className="text-[13px] font-normal text-black">{t("cadastro.confirmarSenha")}</Label>
              <div className="relative">
                <Input
                  id="reg-confirm"
                  type={showConfirmPwd ? "text" : "password"}
                  placeholder={t("cadastro.confirmarPlaceholder")}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  className="h-auto rounded-[5px] pr-10 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
              className="w-full h-auto py-[10px] rounded-[5px] font-semibold"
              disabled={loading || !fullName.trim() || !email.trim() || !password || !confirmPwd}
            >
              {loading ? t("cadastro.criando") : t("cadastro.botao")}
            </Button>

          </form>
        </div>
      </div>
      </div>
      <RodapeLegal />
    </div>
  );
}
