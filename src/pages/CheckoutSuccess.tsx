import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { CheckCircle2, Loader2 } from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  starter:   "Starter",
  essential: "Essential",
  pro:       "Pro",
};

const PERIOD_LABELS: Record<string, string> = {
  monthly:    "Mensal",
  semiannual: "Semestral",
  annual:     "Anual",
};

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { subscription, loading, refetch } = useSubscription();
  const [attempts, setAttempts] = useState(0);

  // Poll until subscription appears (webhook may take a few seconds)
  useEffect(() => {
    if (subscription || attempts >= 6) return;
    const timer = setTimeout(() => {
      refetch();
      setAttempts((a) => a + 1);
    }, 1500);
    return () => clearTimeout(timer);
  }, [subscription, attempts]);

  const planLabel      = subscription?.plan_name ? PLAN_LABELS[subscription.plan_name]  ?? subscription.plan_name  : null;
  const periodLabel    = subscription?.billing_period ? PERIOD_LABELS[subscription.billing_period] ?? subscription.billing_period : null;
  const trialEndsAt    = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString("pt-BR")
    : null;

  const isStillLoading = loading || (!subscription && attempts < 6);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: "#F0F4F8" }}>
      <div
        className="w-full max-w-md bg-card rounded-2xl p-8 text-center"
        style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)" }}
      >
        <div className="flex justify-center mb-6">
          <Logo size="md" showIcon />
        </div>

        {isStillLoading ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 size={36} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Confirmando sua assinatura...</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={36} className="text-emerald-500" />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-2">
              {sessionId ? "Assinatura confirmada!" : "Bem-vindo ao Rezult!"}
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              {trialEndsAt
                ? `Seu período de trial gratuito está ativo até ${trialEndsAt}. Aproveite todos os recursos do plano!`
                : "Sua assinatura está ativa. Aproveite todos os recursos do plano!"}
            </p>

            {(planLabel || periodLabel) && (
              <div className="bg-muted rounded-xl p-4 mb-6 text-left space-y-2">
                {planLabel && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Plano</span>
                    <span className="font-semibold text-foreground">{planLabel}</span>
                  </div>
                )}
                {periodLabel && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cobrança</span>
                    <span className="font-semibold text-foreground">{periodLabel}</span>
                  </div>
                )}
                {trialEndsAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Trial até</span>
                    <span className="font-semibold text-foreground">{trialEndsAt}</span>
                  </div>
                )}
              </div>
            )}

            <Button
              type="button"
              className="w-full h-11 rounded-xl font-semibold"
              onClick={() => navigate("/dashboard")}
            >
              Acessar o Rezult CRM
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
