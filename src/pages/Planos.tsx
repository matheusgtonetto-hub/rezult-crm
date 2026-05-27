import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Zap, ArrowLeft, Loader2 } from "lucide-react";

// ─── Price IDs (Stripe test mode) ────────────────────────────────────────────

const STRIPE_PRICES = {
  starter: {
    monthly:    "price_1Tbp3sHLGbQg56rmYk9RbtKj",
    semiannual: "price_1Tbp3sHLGbQg56rm6sleoFHK",
    annual:     "price_1Tbp3sHLGbQg56rmuvxhNhoQ",
  },
  essential: {
    monthly:    "price_1Tbp7lHLGbQg56rmxz4NpynU",
    semiannual: "price_1Tbp7lHLGbQg56rmnvtsYz4a",
    annual:     "price_1Tbp7lHLGbQg56rmJcvQ4GY5",
  },
  pro: {
    monthly:    "price_1TbpAAHLGbQg56rmh1i1HdvY",
    semiannual: "price_1TbpAAHLGbQg56rmzhs7ffCL",
    annual:     "price_1TbpAAHLGbQg56rmYRFZlZ3I",
  },
} as const;

type PlanKey = keyof typeof STRIPE_PRICES;
type BillingPeriod = "monthly" | "semiannual" | "annual";

// ─── Plan display data ────────────────────────────────────────────────────────

interface PlanInfo {
  key: PlanKey;
  name: string;
  badge?: string;
  prices: { monthly: string; semiannual: string; annual: string };
  features: string[];
}

const PLAN_INFO: PlanInfo[] = [
  {
    key: "starter",
    name: "Starter",
    prices: { monthly: "R$ 237", semiannual: "R$ 1.209", annual: "R$ 1.989" },
    features: [
      "Até 5 pipelines com até 8 etapas",
      "Negócios e produtos",
      "Até 5 mil leads com tags",
      "4 membros",
      "8 automações",
      "3 conexões de multiatendimento",
      "3 Webhooks",
    ],
  },
  {
    key: "essential",
    name: "Essential",
    badge: "Mais popular",
    prices: { monthly: "R$ 399", semiannual: "R$ 2.035", annual: "R$ 3.352" },
    features: [
      "Até 20 pipelines com até 15 etapas",
      "Negócios e produtos",
      "Até 100 mil leads com tags",
      "15 membros",
      "20 automações",
      "10 conexões de multiatendimento",
      "15 Webhooks",
      "Dashboards de negócios",
      "Acesso à API",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    prices: { monthly: "R$ 747", semiannual: "R$ 3.810", annual: "R$ 6.272" },
    features: [
      "Pipelines ilimitadas com até 25 etapas",
      "Leads ilimitados",
      "Membros ilimitados",
      "Automações ilimitadas",
      "Conexões ilimitadas",
      "Webhooks ilimitados",
      "Dashboards + API",
    ],
  },
];

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly:    "Mensal",
  semiannual: "Semestral",
  annual:     "Anual",
};

const PERIOD_DISCOUNT: Record<BillingPeriod, string | null> = {
  monthly:    null,
  semiannual: "-15%",
  annual:     "-30%",
};


// ─── Component ───────────────────────────────────────────────────────────────

export default function PlanosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company } = useCompany();
  const { subscription, isActive, plan: activePlan } = useSubscription();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSelectPlan = async (planKey: PlanKey) => {
    if (!user)    { toast.error("Você precisa estar logado para assinar um plano."); return; }
    if (!company) { toast.error("Nenhuma empresa encontrada. Configure sua empresa primeiro."); return; }

    const priceId = STRIPE_PRICES[planKey][billingPeriod];
    setLoadingPlan(planKey);

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
          planName:      planKey,
          billingPeriod,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Erro ao criar sessão de pagamento.");
      }

      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar checkout.");
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12" style={{ background: "#F0F4F8" }}>
      {/* Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-10">
        <Logo size="md" showIcon />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          Voltar
        </button>
      </div>

      {/* Heading */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Escolha seu plano</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Todos os planos incluem 7 dias grátis. Cancele quando quiser.
        </p>
      </div>

      {/* Billing period toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-card border border-border mb-8">
        {(["monthly", "semiannual", "annual"] as BillingPeriod[]).map((period) => {
          const discount = PERIOD_DISCOUNT[period];
          return (
            <button
              key={period}
              type="button"
              onClick={() => setBillingPeriod(period)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                billingPeriod === period
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {PERIOD_LABELS[period]}
              {discount && (
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    billingPeriod === period
                      ? "bg-white/20 text-white"
                      : "bg-emerald-100 text-emerald-700"
                  )}
                >
                  {discount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Plan cards */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLAN_INFO.map((plan) => {
          const isCurrentPlan = isActive && activePlan === plan.key;
          const isLoading = loadingPlan === plan.key;

          return (
            <div
              key={plan.key}
              className={cn(
                "relative flex flex-col rounded-2xl border-2 p-6 bg-card transition-all",
                plan.badge
                  ? "border-primary shadow-md shadow-primary/10"
                  : "border-border"
              )}
            >
              {/* Popular badge */}
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
                  {plan.badge}
                </span>
              )}

              {/* Plan name */}
              <h3 className="text-base font-bold text-foreground">{plan.name}</h3>

              {/* Price */}
              <div className="mt-4 mb-1">
                <span className="text-3xl font-bold text-foreground">
                  {plan.prices[billingPeriod]}
                </span>
                {billingPeriod === "monthly" && (
                  <span className="text-xs text-muted-foreground ml-1">/mês</span>
                )}
              </div>
              {billingPeriod !== "monthly" && (
                <p className="text-xs text-muted-foreground mb-1">cobrado de uma vez</p>
              )}

              {/* Discount badge */}
              {PERIOD_DISCOUNT[billingPeriod] ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 w-fit mb-4">
                  <Zap size={10} className="text-emerald-600" />
                  {PERIOD_DISCOUNT[billingPeriod]} de desconto
                </span>
              ) : (
                <div className="mb-4 h-5" />
              )}

              {/* Features */}
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
              {isCurrentPlan ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 rounded-lg text-sm font-semibold"
                  disabled
                >
                  Plano atual
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={plan.badge ? "default" : "outline"}
                  className="w-full h-10 rounded-lg text-sm font-semibold"
                  disabled={loadingPlan !== null}
                  onClick={() => handleSelectPlan(plan.key)}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Aguarde...
                    </span>
                  ) : (
                    "Começar 7 dias grátis"
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-8 text-center max-w-sm">
        Ao assinar você concorda com os nossos termos de uso. O período de trial gratuito começa
        ao inserir os dados de pagamento e o valor só é cobrado após os 7 dias.
      </p>
    </div>
  );
}
