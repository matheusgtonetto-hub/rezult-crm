import { useState } from "react";
import { useCompany } from "@/context/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLANS } from "@/data/plans";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Zap, X } from "lucide-react";

type BillingTab = "mensal" | "semestral" | "anual";

export const BANNER_HEIGHT = 52;

export function FreePlanBanner() {
  const { isFreePlan, planExpired, planDaysLeft } = useCompany();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [billingTab, setBillingTab]   = useState<BillingTab>("mensal");

  // Only show when actively in free trial (not expired)
  if (!isFreePlan || planExpired || planDaysLeft === null) return null;

  const daysText = planDaysLeft === 1 ? "1 dia" : `${planDaysLeft} dias`;

  const getPrice = (plan: typeof PLANS[0]) => {
    if (billingTab === "semestral") return plan.pricing.semestral;
    if (billingTab === "anual")     return plan.pricing.anual;
    return plan.pricing.mensal;
  };

  const getSave = (plan: typeof PLANS[0]) => {
    if (billingTab === "semestral") return plan.pricing.semestralSave;
    if (billingTab === "anual")     return plan.pricing.anualSave;
    return null;
  };

  return (
    <>
      {/* ── Fixed bottom banner ─────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6"
        style={{
          height: BANNER_HEIGHT,
          background: "hsl(var(--primary))",
        }}
      >
        <p className="text-sm font-medium text-primary-foreground">
          Seu plano gratuito acaba em{" "}
          <strong className="font-bold">{daysText}</strong>
        </p>
        <Button
          size="sm"
          className="h-8 text-xs font-semibold rounded-lg bg-white text-primary hover:bg-white/90"
          onClick={() => setUpgradeOpen(true)}
        >
          Fazer upgrade agora!
        </Button>
      </div>

      {/* ── Upgrade dialog ──────────────────────────────────────────────── */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent
          className="rounded-2xl p-8"
          style={{ maxWidth: 920 }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Encontre o plano que atende às suas necessidades!
            </DialogTitle>
          </DialogHeader>

          {/* Billing tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit mt-4 mb-6">
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
              const save = getSave(plan);
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
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
                      {plan.badge}
                    </span>
                  )}

                  <h3 className="text-base font-bold text-foreground">{plan.name}</h3>

                  <div className="mt-4 mb-1">
                    <span className="text-2xl font-bold text-foreground">
                      {getPrice(plan)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">/mês</span>
                  </div>

                  {save ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 w-fit mb-4">
                      <Zap size={10} className="text-emerald-600" />
                      economize {save}
                    </span>
                  ) : (
                    <div className="mb-4 h-5" />
                  )}

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

                  <Button
                    type="button"
                    variant={plan.badge ? "default" : "outline"}
                    className="w-full h-10 rounded-lg text-sm font-semibold"
                    onClick={() => toast.info("Em breve: contratação de planos.")}
                  >
                    Atualizar plano
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Footer link */}
          <div className="flex justify-center pt-4">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
              onClick={() => setUpgradeOpen(false)}
            >
              Continuar usando apenas para consulta
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
