import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PLANS, type PlanDefinition } from "@/data/plans";
import { STRIPE_PRICES } from "@/data/stripePrices";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronDown,
  UserPlus,
  Users,
  CircleCheck,
  Crown,
  Trophy,
  Filter,
  Network,
  Tag,
  UserRound,
  Rocket,
  MessageCircle,
  CalendarDays,
} from "lucide-react";

type Step = 1 | 2;
type BillingTab = "mensal" | "semestral" | "anual";

type PlanKey = keyof typeof STRIPE_PRICES;

const BILLING_TAB_TO_PERIOD: Record<BillingTab, "monthly" | "semiannual" | "annual"> = {
  mensal:    "monthly",
  semestral: "semiannual",
  anual:     "annual",
};

const STEP_META = [
  {
    title: "Convide um membro",
    subtitle: "Você pode convidar uma pessoa agora para colaborar na sua empresa. Poderá adicionar mais membros depois em Configurações > Empresa > Equipe.",
    sideLabel: "Convidar membro",
  },
  {
    title: "Selecione seu plano",
    subtitle: "",
    sideLabel: "Plano",
  },
];

const SETUP_PLAN_TOTALS: Record<string, { semestral: string; anual: string }> = {
  silver:   { semestral: "R$ 1.209,00",  anual: "R$ 1.989,00"  },
  platinum: { semestral: "R$ 2.035,00",  anual: "R$ 3.352,00"  },
  emerald:  { semestral: "R$ 3.810,00",  anual: "R$ 6.272,00"  },
};

function renderFeature(text: string) {
  const match = text.match(/^(\d+\s+\w+|\w+)([\s\S]*)$/);
  if (!match) return <>{text}</>;
  return <><strong className="font-semibold">{match[1]}</strong>{match[2]}</>;
}

const SETUP_PLAN_FEATURES: Record<string, string[]> = {
  silver: [
    "4 membros na empresa.",
    "5 mil leads com controle de tags.",
    "8 automações para interações.",
    "3 conexões multiatendimento.",
    "5 pipelines com até 8 etapas.",
    "3 integrações via Webhook.",
    "Acesso à API e MCP.",
    "Dashboards detalhados da operação.",
  ],
  platinum: [
    "15 membros na empresa.",
    "100 mil leads com tags.",
    "20 automações para interações.",
    "10 conexões multiatendimento.",
    "20 pipelines com até 15 etapas.",
    "15 integrações via Webhook.",
    "Acesso à API e MCP.",
    "Dashboards detalhados da operação.",
  ],
  emerald: [
    "Membros ilimitados na empresa.",
    "Leads ilimitados com tags.",
    "Automações ilimitadas.",
    "Conexões ilimitadas.",
    "Pipelines ilimitadas.",
    "Integrações ilimitadas.",
    "Acesso à API e MCP.",
    "Dashboards detalhados da operação.",
  ],
};

const PERMISSION_GROUPS = [
  {
    id: "pipelines", label: "Pipelines", icon: Filter,
    description: "Permissões relacionadas à administração de pipelines.",
    options: [
      { id: "pipelines:admin",  label: "Administrador de Pipelines", description: "Permite a criação, modificação, duplicação e configuração de pipelines." },
      { id: "pipelines:member", label: "Membro de Pipelines",        description: "Possibilita a manutenção de negócios na pipeline." },
    ],
  },
  {
    id: "automacoes", label: "Automações", icon: Network,
    description: "Permissões relacionadas ao fluxo de automações",
    options: [
      { id: "automacoes:admin",  label: "Administrador das Automações", description: "Permite acesso à visualização das automações e a todas as ações relacionadas à elas." },
      { id: "automacoes:member", label: "Membro das Automações",        description: "Permite acesso à visualização das automações" },
    ],
  },
  {
    id: "cadastros", label: "Cadastros auxiliares", icon: Tag,
    description: "Permissões relacionadas aos cadastros auxiliares",
    options: [
      { id: "cadastros:admin",  label: "Administrador de Cadastros Auxiliares", description: "Permite acesso a criação, edição e exclusão dos auxiliares, como: produtos, tags, listas, etc." },
      { id: "cadastros:member", label: "Membro de Cadastros Auxiliares",        description: "Permite acesso à listagem de auxiliares, como: produtos, tags, listas etc." },
    ],
  },
  {
    id: "leads", label: "Leads", icon: UserRound,
    description: "Permissões relacionadas à gestão de leads.",
    options: [
      { id: "leads:admin",      label: "Administrador de Leads",     description: "Permite acesso à listagem de leads e a todas as ações relacionadas à eles." },
      { id: "leads:operator",   label: "Operador de Leads",          description: "Permite criação e alteração de leads (usar em conjunto com Membro de leads restrito)." },
      { id: "leads:member",     label: "Membro de Leads",            description: "Permite acesso à listagem de leads." },
      { id: "leads:restricted", label: "Membro de Leads (restrito)", description: "Acessa os leads o qual o usuário é responsável e os negócios que o usuário é o atendente responsável." },
    ],
  },
  {
    id: "impulsos", label: "Impulsos", icon: Rocket,
    description: "Permite acesso ao Impulsos.",
    options: [
      { id: "impulsos:admin", label: "Administrador de Boosts", description: "Permite acesso ao Impulsos." },
    ],
  },
  {
    id: "multiatendimento", label: "Multiatendimento", icon: MessageCircle,
    description: "Permissões relacionadas ao multiatendimento",
    options: [
      { id: "multiatendimento:admin",      label: "Administrador de multiatendimento", description: "Permite acesso completo ao multiatendimento, ao dashboard e às configurações, sem limitações." },
      { id: "multiatendimento:supervisor", label: "Supervisor de multiatendimento",    description: "Permite acesso ao multiatendimento e ao dashboard, respeitando as permissões configuradas." },
      { id: "multiatendimento:attendant",  label: "Atendente de multiatendimento",     description: "Permite acesso ao multiatendimento, limitado pelas configurações de permissões." },
    ],
  },
  {
    id: "atividades", label: "Atividades", icon: CalendarDays,
    description: "Permissões relacionadas às atividades.",
    options: [
      { id: "atividades:admin", label: "Administrador de Atividades", description: "Permite acesso ao calendário de atividade de todos atendentes." },
    ],
  },
];

function PermissionsEditor({ permissions, onChange }: { permissions: string[]; onChange: (p: string[]) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(PERMISSION_GROUPS.map(g => [g.id, false]))
  );

  const toggle = (permId: string) => {
    const next = permissions.includes(permId)
      ? permissions.filter(p => p !== permId)
      : [...permissions.filter(p => !p.startsWith(permId.split(":")[0] + ":")), permId];
    onChange(next);
  };

  return (
    <div className="space-y-[5px]">
      {PERMISSION_GROUPS.map(group => {
        const Icon = group.icon;
        const isOpen = openGroups[group.id] ?? true;
        const groupSelected = group.options.some(o => permissions.includes(o.id));
        return (
          <div key={group.id} className="border border-gray-200 rounded-[8px] overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setOpenGroups(prev => ({ ...prev, [group.id]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 text-left">
                <p className={`text-[12px] font-semibold flex items-center gap-1.5 ${groupSelected ? "text-primary" : "text-foreground"}`}>
                  <Icon size={14} className="shrink-0" />
                  {group.label}
                </p>
                {isOpen && <p className="text-[12px] text-muted-foreground leading-tight mt-[5px]">{group.description}</p>}
              </div>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div>
                {group.options.map(opt => {
                  const selected = permissions.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${selected ? "bg-primary/10" : "bg-white hover:bg-gray-50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggle(opt.id)}
                        className="mt-0.5 accent-primary w-4 h-4 shrink-0"
                      />
                      <div>
                        <p className={`text-[12px] font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                        <p className="text-[12px] text-muted-foreground mt-[1px] leading-tight">{opt.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SetupPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const initStep  = (location.state as { step?: number } | null)?.step ?? 1;
  const { company, companyLoading, isFreePlan } = useCompany();
  const { user } = useAuth();

  useEffect(() => {
    if (companyLoading) return;
    if (company && !isFreePlan) {
      navigate("/dashboard", { replace: true });
    }
  }, [companyLoading, company, isFreePlan, navigate]);

  const [step, setStep] = useState<Step>(Math.min(initStep, 2) as Step);

  const [inviteOpen, setInviteOpen]       = useState(false);
  const [inviteEmail, setInviteEmail]     = useState("");
  const [invitePerms, setInvitePerms]     = useState<string[]>([]);
  const [isAdminInvite, setIsAdminInvite] = useState(false);
  const [inviting, setInviting]           = useState(false);

  const [billingTab, setBillingTab]   = useState<BillingTab>("mensal");
  const [confirmPlan, setConfirmPlan] = useState<PlanKey | null>(null);
  const [confirming, setConfirming]   = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [planConfirmed, setPlanConfirmed] = useState(false);

  const handleNext = () => {
    if (step < 2) setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };


  const handleSelectPlan = (planKey: PlanKey) => {
    setConfirmPlan(planKey);
  };

  const handleConfirmPlan = async () => {
    if (!user || !company || !confirmPlan) return;
    setConfirming(true);

    const priceId = STRIPE_PRICES[confirmPlan][BILLING_TAB_TO_PERIOD[billingTab]];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          priceId,
          companyId:     company.id,
          userId:        user.id,
          userEmail:     user.email ?? "",
          planName:      confirmPlan,
          billingPeriod: BILLING_TAB_TO_PERIOD[billingTab],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Erro ao criar sessão de pagamento.");
      window.open(data.url, "_blank");
      setConfirmPlan(null);
      setPlanConfirmed(true);
      setSuccessOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar checkout.");
    } finally {
      setConfirming(false);
    }
  };

  const handleAddMember = async () => {
    if (!inviteEmail.trim()) { toast.error("Informe o e-mail do usuário."); return; }
    setInviting(true);
    const permsToSend = isAdminInvite ? ["admin"] : invitePerms;
    const { data, error } = await supabase.rpc("add_member_to_company", {
      member_email: inviteEmail.trim().toLowerCase(),
      member_permissions: permsToSend,
    });
    setInviting(false);

    if (error) { toast.error(`Erro ao processar convite: ${error.message}`); return; }

    if (data === "ok") {
      toast.success("Membro adicionado com sucesso!");
    } else if (data === "invited") {
      toast.success("Convite registrado! O acesso será liberado ao criar conta com este e-mail.");
    } else if (data === "no_company") {
      toast.error("Sua conta ainda não está vinculada a uma empresa."); return;
    } else {
      toast.error("Resposta inesperada do servidor."); return;
    }

    setInviteEmail("");
    setInvitePerms([]);
    setIsAdminInvite(false);
    setInviteOpen(false);
  };

  const stepProgress  = (step / 2) * 100;
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

  return (
    <>
      <div className="min-h-screen overflow-y-auto flex items-center justify-center px-4 py-10" style={{ background: "#EFF5F2" }}>
        <div className={cn(
          "relative rounded-[7px] p-[1px] overflow-hidden w-full",
          step === 2 ? "max-w-[1100px]" : "max-w-[1000px]"
        )}>
          {/* Rotating border light */}
          <div
            className="absolute inset-[-100%]"
            style={{
              background: "conic-gradient(from 0deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
              animation: "spin-border 4s linear infinite",
            }}
          />

          <div className="relative w-full bg-card rounded-[7px] overflow-hidden flex" style={{ height: 600 }}>
            {/* ── Left sidebar ── */}
            <div className="w-[280px] shrink-0 flex flex-col pl-[35px] pr-[20px] pt-10 pb-10">
              <div className="flex items-center mb-5">
                <Logo size="sm" showIcon />
                <span className="text-[22px] text-primary leading-none ml-1" style={{ letterSpacing: "-0.030em", fontWeight: 650 }}>CRM</span>
              </div>

              <h2 className="text-[15px] font-semibold text-foreground mb-1">Configure sua conta</h2>
              <p className="text-[12px] text-muted-foreground leading-snug mb-6">
                Finalize as configurações iniciais para começar a usar o Rezult CRM.
              </p>

              {/* Step list */}
              <div className="space-y-[14px]">
                {STEP_META.map((meta, i) => {
                  const num      = i + 1;
                  const isActive = step === num;
                  const isDone   = step > num;
                  return (
                    <div key={num} className="flex items-center gap-2.5">
                      <div className={cn(
                        "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 border-2",
                        isActive ? "border-primary bg-primary text-white" :
                        isDone   ? "border-primary bg-primary/10 text-primary" :
                                   "border-muted-foreground/30 text-muted-foreground"
                      )}>
                        {num}
                      </div>
                      <span className={cn(
                        "text-[12px] leading-tight",
                        isActive ? "text-foreground font-medium" : "text-muted-foreground"
                      )}>
                        {meta.sideLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="w-px bg-border my-8 shrink-0" />

            {/* ── Right content ── */}
            <div className="flex-1 flex flex-col pl-[25px] pr-10 pt-8 pb-6 min-w-0">
              {/* Title + counter */}
              <div className="flex items-center justify-between mb-1">
                <h1 className="text-[20px] font-semibold text-foreground">{title}</h1>
                <span className="text-[12px] text-muted-foreground font-medium shrink-0 ml-2">{step}/2</span>
              </div>

              {/* Progress bar */}
              <div className="h-[3px] bg-border rounded-full mb-2">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${stepProgress}%` }} />
              </div>

              {step !== 1 && (
                <p className="text-[14px] text-foreground mt-2 mb-2" style={{ fontWeight: 600 }}>{subtitle}</p>
              )}

              {/* ── Step 1: Invite ── */}
              {step === 1 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                    <Users size={26} className="text-emerald-600" />
                  </div>
                  <p className="text-[14px] text-gray-500 max-w-sm mb-[30px]" style={{ fontWeight: 500 }}>{subtitle}</p>
                  <Button
                    type="button"
                    className="h-auto py-[10px] px-5 rounded-[5px] font-semibold gap-2"
                    onClick={() => setInviteOpen(true)}
                  >
                    <UserPlus size={16} />
                    Convidar usuário
                  </Button>
                </div>
              )}

              {/* ── Step 2: Plans ── */}
              {step === 2 && (
                <div className="mt-1">
                  {/* Billing tabs */}
                  <div className="flex gap-[3px] p-[3px] rounded-full bg-white border border-primary w-fit mb-3 mx-auto">
                    {(["anual", "semestral", "mensal"] as BillingTab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setBillingTab(tab)}
                        className={cn(
                          "px-3 py-[4px] rounded-full text-[12px] font-medium capitalize transition-all",
                          billingTab === tab
                            ? "bg-primary text-white shadow-sm"
                            : "text-foreground hover:text-foreground"
                        )}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Plan cards */}
                  <div className="grid grid-cols-3 gap-3 pt-3">
                    {PLANS.map((plan) => {
                      const save = getPlanSave(plan);
                      return (
                        <div
                          key={plan.key}
                          className={cn(
                            "relative flex flex-col rounded-[7px] border bg-white p-4 transition-all",
                            plan.badge ? "border-primary" : "border-gray-300"
                          )}
                        >
                          {plan.badge && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1">
                              <Trophy size={11} />
                              {plan.badge}
                            </span>
                          )}

                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-[16px] font-bold text-foreground shrink-0">{plan.name}</h3>
                            {save && (
                              <span className="inline-flex items-center text-[10px] font-medium text-emerald-700 bg-emerald-50 rounded-[8px] px-1.5 py-0.5 truncate">
                                <span className="truncate">Economize {save}</span>
                              </span>
                            )}
                          </div>

                          <div className="mt-2 mb-3">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="text-[20px] font-bold text-primary">{getPlanPrice(plan)}</span>
                                <span className="text-[12px] text-muted-foreground ml-1">/mês</span>
                              </div>
                              <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0 capitalize">
                                {billingTab.charAt(0).toUpperCase() + billingTab.slice(1)}
                              </span>
                            </div>
                            {billingTab !== "mensal" && SETUP_PLAN_TOTALS[plan.key] && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Pagamento recorrente de {SETUP_PLAN_TOTALS[plan.key][billingTab as "semestral" | "anual"]}
                              </p>
                            )}
                          </div>

                          <ul className="space-y-1 flex-1 mb-3">
                            {(SETUP_PLAN_FEATURES[plan.key] ?? plan.features).map((f) => (
                              <li key={f} className="flex items-start gap-2 text-[12px] text-foreground">
                                <CircleCheck size={12} className="mt-0.5 shrink-0 fill-primary stroke-white" />
                                {renderFeature(f)}
                              </li>
                            ))}
                          </ul>

                          <Button
                            type="button"
                            variant="default"
                            className="w-full h-auto py-[7px] rounded-[5px] text-[12px] font-semibold"
                            onClick={() => handleSelectPlan(plan.key as PlanKey)}
                          >
                            Selecionar plano
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Navigation ── */}
              <div className="flex justify-end gap-2 mt-auto pt-3">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    className="h-auto py-[9px] px-5 rounded-[5px] font-semibold"
                  >
                    Voltar
                  </Button>
                )}

                {step < 2 && (
                  <Button
                    type="button"
                    onClick={handleNext}
                    className="h-auto py-[9px] px-5 rounded-[5px] font-semibold"
                  >
                    Próximo
                    <ChevronRight size={15} className="ml-1" />
                  </Button>
                )}

                {step === 2 && (
                  <Button
                    type="button"
                    onClick={() => navigate("/dashboard")}
                    className="h-auto py-[9px] px-5 rounded-[5px] font-semibold"
                  >
                    {planConfirmed ? "Acessar" : "Teste Grátis"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirmation dialog ── */}
      <Dialog open={!!confirmPlan} onOpenChange={v => { if (!v) setConfirmPlan(null); }}>
        <DialogContent className="max-w-[400px] rounded-[7px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-[16px]">Confirmar seleção de plano</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {confirmPlan && (() => {
              const plan = PLANS.find(p => p.key === confirmPlan)!;
              const price = getPlanPrice(plan);
              const total = billingTab !== "mensal" ? SETUP_PLAN_TOTALS[confirmPlan]?.[billingTab as "semestral" | "anual"] : null;
              return (
                <>
                  <div className="flex items-center justify-between py-3 border-y border-gray-100">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{plan.name} — {billingTab.charAt(0).toUpperCase() + billingTab.slice(1)}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{price}/mês</p>
                    </div>
                    {total && (
                      <p className="text-[12px] text-muted-foreground">Total: <span className="font-semibold text-foreground">{total}</span></p>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">O checkout será aberto em uma nova aba para concluir o pagamento.</p>
                </>
              );
            })()}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmPlan(null)} className="flex-1 rounded-[5px]">Cancelar</Button>
            <Button onClick={handleConfirmPlan} disabled={confirming} className="flex-1 rounded-[5px]">
              {confirming ? "Aguarde..." : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Success dialog ── */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-[400px] rounded-[7px] bg-white text-center">
          <div className="flex flex-col items-center py-4 gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CircleCheck size={36} className="fill-primary stroke-white" />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-foreground">Parabéns!</h2>
              <p className="text-[15px] text-foreground mt-1 leading-snug" style={{ fontWeight: 500 }}>
                Seu plano foi selecionado com sucesso.
              </p>
              <p className="text-[13px] text-muted-foreground mt-2 leading-snug">
                Após finalizar o pagamento clique em "Concluir", aguarde alguns segundos e atualize a página para conferir as alterações.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Invite modal ── */}
      <Dialog open={inviteOpen} onOpenChange={v => { if (!v) { setInviteOpen(false); setInviteEmail(""); setInvitePerms([]); setIsAdminInvite(false); } }}>
        <DialogContent className="max-w-lg bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar membro à equipe</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">E-mail do usuário *</label>
              <Input
                type="email"
                placeholder="joao@empresa.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="border-gray-200 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                autoFocus
              />
            </div>

            <p className="text-xs font-semibold text-muted-foreground">Selecione as permissões do usuário</p>

            <label className={`flex items-center gap-3 px-3 py-2.5 rounded-[8px] border cursor-pointer transition-colors ${isAdminInvite ? "border-[#D97706] bg-[#FFFBEB]" : "border-gray-200 bg-white hover:bg-muted/50"}`}>
              <div className="flex-1">
                <p className={`text-[12px] font-semibold ${isAdminInvite ? "text-[#D97706]" : "text-foreground"}`}>
                  <Crown size={12} className="inline mr-1" />
                  Administrador (acesso total)
                </p>
                <p className="text-[12px] text-muted-foreground">Concede acesso completo, incluindo visualização, edição, assinatura e gestão de membros.</p>
              </div>
              <input
                type="checkbox"
                checked={isAdminInvite}
                onChange={e => setIsAdminInvite(e.target.checked)}
                className="accent-[#D97706] w-4 h-4 shrink-0"
              />
            </label>

            {!isAdminInvite && (
              <PermissionsEditor permissions={invitePerms} onChange={setInvitePerms} />
            )}
          </div>
          <div className="flex gap-2 w-full pt-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)} className="flex-1 border-card-border">Cancelar</Button>
            <Button onClick={handleAddMember} disabled={inviting} className="flex-1 bg-primary hover:bg-primary/90">
              {inviting ? "Processando..." : "Convidar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
