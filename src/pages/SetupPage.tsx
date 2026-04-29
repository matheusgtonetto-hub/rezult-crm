import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PLANS, type PlanDefinition } from "@/data/plans";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Plug,
  Check,
  Zap,
  MessageCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;
type BillingTab = "mensal" | "semestral" | "anual";


// ─── Step meta ───────────────────────────────────────────────────────────────

const STEP_META = [
  {
    title: "Convide um membro",
    subtitle:
      "Você pode convidar uma pessoa agora para colaborar na sua empresa junto com você. Você poderá adicionar mais membros depois em Configurações > Empresa > Membros.",
  },
  {
    title: "Conecte seus canais",
    subtitle:
      "Conecte seus canais (ex.: WhatsApp, Instagram, E-mail) para iniciar conversas e automações. Você pode configurar agora ou fazer isso depois.",
  },
  {
    title: "Selecione seu plano",
    subtitle: "Escolha o plano ideal para o momento da sua empresa.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function SetupPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const initStep  = (location.state as { step?: number } | null)?.step ?? 1;

  const [step, setStep] = useState<Step>(initStep as Step);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName]   = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState("vendedor");
  const [inviting, setInviting]       = useState(false);

  // Plan step state
  const [billingTab, setBillingTab] = useState<BillingTab>("mensal");

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (step < 3) setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const handleFinish = () => {
    navigate("/dashboard");
  };

  // ── Invite ────────────────────────────────────────────────────────────────

  const handleSendInvite = async () => {
    if (!inviteName.trim())  { toast.error("Informe o nome do convidado."); return; }
    if (!inviteEmail.trim()) { toast.error("Informe o e-mail do convidado."); return; }

    setInviting(true);
    await new Promise((r) => setTimeout(r, 800)); // simulated delay
    setInviting(false);

    toast.success(`Convite enviado para ${inviteEmail}`);
    setInviteOpen(false);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("vendedor");
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const stepProgress = (step / 3) * 100;
  const { title, subtitle } = STEP_META[step - 1];

  const getPlanPrice = (plan: PlanDefinition) => {
    if (billingTab === "mensal")    return plan.pricing.mensal;
    if (billingTab === "semestral") return plan.pricing.semestral;
    return plan.pricing.anual;
  };

  const getPlanSave = (plan: PlanDefinition) => {
    if (billingTab === "semestral") return plan.pricing.semestralSave;
    if (billingTab === "anual")     return plan.pricing.anualSave;
    return null;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="min-h-screen flex items-start justify-center px-4 py-10"
        style={{ background: "#F0F4F8" }}
      >
        <div
          className={cn(
            "w-full bg-card rounded-2xl overflow-hidden",
            step === 3 ? "max-w-[920px]" : "max-w-[560px]"
          )}
          style={{
            boxShadow:
              "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)",
          }}
        >
          {/* Progress bar */}
          <div className="h-1 bg-border">
            <div
              className="h-1 bg-primary transition-all duration-500"
              style={{ width: `${stepProgress}%` }}
            />
          </div>

          <div className="p-10">
            {/* Logo + step counter */}
            <div className="flex items-center justify-between mb-8">
              <Logo size="md" showIcon />
              <span className="text-xs text-muted-foreground font-medium">
                Passo {step} de 3
              </span>
            </div>

            {/* Heading */}
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-[500px]">
              {subtitle}
            </p>

            {/* ── Step 1: Invite ─────────────────────────────────────────── */}
            {step === 1 && (
              <div className="mt-8">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-lg gap-2"
                  onClick={() => setInviteOpen(true)}
                >
                  <UserPlus size={16} />
                  Convidar usuário
                </Button>
              </div>
            )}

            {/* ── Step 2: Channels ───────────────────────────────────────── */}
            {step === 2 && (
              <div className="mt-8">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-lg gap-2"
                  onClick={() => toast.info("Em breve: configuração de canais.")}
                >
                  <Plug size={16} />
                  Criar conexão
                </Button>

                {/* Channel hint cards */}
                <div className="flex gap-3 mt-6 flex-wrap">
                  {[
                    { label: "WhatsApp",  color: "#25D366" },
                    { label: "Instagram", color: "#E1306C" },
                    { label: "E-mail",    color: "#4A90D9" },
                  ].map((ch) => (
                    <div
                      key={ch.label}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground"
                    >
                      <MessageCircle size={14} style={{ color: ch.color }} />
                      {ch.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 3: Plans ──────────────────────────────────────────── */}
            {step === 3 && (
              <div className="mt-8">
                {/* Billing tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit mb-8">
                  {(["anual", "semestral", "mensal"] as BillingTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setBillingTab(tab)}
                      className={cn(
                        "px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all",
                        billingTab === tab
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Plan cards */}
                <div className="grid grid-cols-3 gap-4">
                  {PLANS.map((plan) => {
                    const save = getPlanSave(plan);
                    return (
                      <div
                        key={plan.key}
                        className={cn(
                          "relative flex flex-col rounded-2xl border-2 p-6 transition-all",
                          plan.badge
                            ? "border-primary bg-primary/[0.03]"
                            : "border-border bg-background"
                        )}
                      >
                        {/* Recommended badge */}
                        {plan.badge && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
                            {plan.badge}
                          </span>
                        )}

                        {/* Plan name */}
                        <h3 className="text-base font-bold text-foreground">
                          {plan.name}
                        </h3>

                        {/* Price */}
                        <div className="mt-4 mb-1">
                          <span className="text-2xl font-bold text-foreground">
                            {getPlanPrice(plan)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">/mês</span>
                        </div>

                        {/* Savings badge */}
                        {save ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 w-fit mb-4">
                            <Zap size={10} className="text-emerald-600" />
                            economize {save}
                          </span>
                        ) : (
                          <div className="mb-4 h-5" />
                        )}

                        {/* Feature list */}
                        <ul className="space-y-2 flex-1 mb-6">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <Check
                                size={13}
                                className={cn(
                                  "mt-0.5 shrink-0",
                                  plan.badge ? "text-primary" : "text-emerald-600"
                                )}
                              />
                              {f}
                            </li>
                          ))}
                        </ul>

                        {/* CTA */}
                        <Button
                          type="button"
                          variant={plan.badge ? "default" : "outline"}
                          className="w-full h-10 rounded-lg text-sm font-semibold"
                          onClick={() =>
                            toast.info("Em breve: contratação de planos.")
                          }
                        >
                          Atualizar plano
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Navigation ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
              <div>
                {step > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleBack}
                    className="h-10 px-3 rounded-lg text-muted-foreground"
                  >
                    <ChevronLeft size={16} className="mr-1" />
                    Voltar
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {step < 3 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleNext}
                    className="h-10 px-4 rounded-lg text-muted-foreground font-medium"
                  >
                    Pular por enquanto
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={step === 3 ? handleFinish : handleNext}
                  className="h-10 px-5 rounded-lg font-semibold"
                >
                  {step === 3 ? (
                    "Concluir"
                  ) : (
                    <>
                      Próximo
                      <ChevronRight size={16} className="ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Invite modal ───────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Convidar membro</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name" className="text-xs font-medium">
                Nome
              </Label>
              <Input
                id="invite-name"
                type="text"
                placeholder="João Silva"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="h-10 rounded-lg"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-xs font-medium">
                E-mail
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="joao@empresa.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-10 rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Permissão</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="visualizador">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              className="w-full h-10 rounded-lg font-semibold"
              onClick={handleSendInvite}
              disabled={inviting}
            >
              {inviting ? "Enviando..." : "Enviar convite"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
