import {
  createContext, useContext, useEffect, useState,
  useCallback, useMemo, ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface Company {
  id: string;
  owner_id: string;
  name: string;
  email: string;
  phone: string;
  niche: string;
  country: string;
  plan: string;
  plan_expires_at: string;
}

interface CompanyContextType {
  company: Company | null;
  companyLoading: boolean;
  isFreePlan: boolean;
  planExpired: boolean;
  planDaysLeft: number | null;
  refetchCompany: () => void;
  updateCompany: (data: Partial<Pick<Company, "phone" | "name" | "email">>) => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be within CompanyProvider");
  return ctx;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany]           = useState<Company | null>(null);
  const [companyLoading, setLoading]    = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("companies")
      .select("id, owner_id, name, email, phone, niche, country, plan, plan_expires_at")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error) console.error("[CompanyContext] fetch error:", error);
    setCompany(data ?? null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const isFreePlan = company?.plan === "free";

  const planExpired = useMemo(() => {
    if (!company) return false;
    return new Date(company.plan_expires_at) < new Date();
  }, [company]);

  const planDaysLeft = useMemo(() => {
    if (!company || company.plan !== "free" || planExpired) return null;
    const diff = new Date(company.plan_expires_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [company, planExpired]);

  const updateCompany = useCallback(async (data: Partial<Pick<Company, "phone" | "name" | "email">>) => {
    if (!user || !company) return;
    const { data: updated } = await supabase
      .from("companies")
      .update(data)
      .eq("id", company.id)
      .select()
      .single();
    if (updated) setCompany(updated as Company);
  }, [user, company]);

  return (
    <CompanyContext.Provider
      value={{ company, companyLoading, isFreePlan, planExpired, planDaysLeft, refetchCompany: load, updateCompany }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
