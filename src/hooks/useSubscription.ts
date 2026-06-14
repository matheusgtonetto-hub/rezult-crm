import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyContext";

export interface Subscription {
  id: string;
  company_id: string;
  owner_user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_name: "silver" | "platinum" | "emerald" | null;
  billing_period: "monthly" | "semiannual" | "annual" | null;
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UseSubscriptionResult {
  subscription: Subscription | null;
  loading: boolean;
  plan: Subscription["plan_name"];
  status: Subscription["status"];
  isTrialing: boolean;
  isActive: boolean;
  isCanceled: boolean;
  isPastDue: boolean;
  trialEndsAt: Date | null;
  refetch: () => void;
}

export function useSubscription(): UseSubscriptionResult {
  const { company, companyLoading } = useCompany();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = async () => {
    if (!company) { setSubscription(null); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("company_id", company.id)
        .in("status", ["trialing", "active", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubscription(data as Subscription | null);
    } catch {
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyLoading) return;
    fetchSubscription();
  }, [company?.id, companyLoading]);

  const status = subscription?.status ?? null;

  return {
    subscription,
    loading: loading || companyLoading,
    plan:        subscription?.plan_name ?? null,
    status,
    isTrialing:  status === "trialing",
    isActive:    status === "active" || status === "trialing",
    isCanceled:  status === "canceled",
    isPastDue:   status === "past_due",
    trialEndsAt: subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null,
    refetch:     fetchSubscription,
  };
}
