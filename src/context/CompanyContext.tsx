import {
  createContext, useContext, useEffect, useState,
  useCallback, useMemo, ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export interface Company {
  id: string;
  owner_id: string;
  name: string;
  email: string;
  phone: string;
  niche: string;
  country: string;
  plan: string;
  plan_expires_at: string;
  // Address
  zip_code?: string;
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  // Documents
  document_type?: string;
  document?: string;
  // Logo
  logo_url?: string;
  // Z-API WhatsApp integration
  zapi_instance_id?: string | null;
  zapi_token?: string | null;
  zapi_client_token?: string | null;
  zapi_phone?: string | null;
  zapi_connected?: boolean;
  // Meta
  created_at?: string;
}

type CompanyUpdateData = Partial<Omit<Company, "id" | "owner_id" | "plan" | "plan_expires_at">>;

interface CompanyContextType {
  company: Company | null;
  companyLoading: boolean;
  isFreePlan: boolean;
  planExpired: boolean;
  planDaysLeft: number | null;
  refetchCompany: () => void;
  updateCompany: (data: CompanyUpdateData) => Promise<void>;
  uploadLogo: (file: File) => Promise<void>;
}

const COMPANY_FIELDS = "*";

const CompanyContext = createContext<CompanyContextType | null>(null);

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be within CompanyProvider");
  return ctx;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany]        = useState<Company | null>(null);
  const [companyLoading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    let data: Company | null = null;

    // Check membership first: if company_name points to a company the user does NOT own,
    // they are a member of that company — use it instead of their own
    const { data: profileData } = await supabase
      .from("profiles")
      .select("company_name")
      .eq("id", user.id)
      .single();

    if (profileData?.company_name) {
      const { data: memberCompany, error: memberError } = await supabase
        .from("companies")
        .select(COMPANY_FIELDS)
        .eq("name", profileData.company_name)
        .neq("owner_id", user.id)
        .maybeSingle();
      if (memberError) console.error("[CompanyContext] member query error:", memberError);
      if (memberCompany) data = memberCompany as Company;
    }

    // If not a member of another company, load owned company
    if (!data) {
      const { data: ownerRows, error } = await supabase
        .from("companies")
        .select(COMPANY_FIELDS)
        .eq("owner_id", user.id)
        .order("plan_expires_at", { ascending: false });

      if (error) console.error("[CompanyContext] owner query error:", error);

      // If multiple rows exist (duplicate companies), prefer any non-free plan
      if (ownerRows && ownerRows.length > 0) {
        data = (ownerRows.find((r) => r.plan !== "free") ?? ownerRows[0]) as Company;
      }
    }

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

  const updateCompany = useCallback(async (data: CompanyUpdateData) => {
    if (!user || !company) return;
    const { data: updated, error } = await supabase
      .from("companies")
      .update(data)
      .eq("id", company.id)
      .select(COMPANY_FIELDS)
      .single();
    if (error) throw error;
    if (updated) setCompany(updated as Company);
  }, [user, company]);

  const uploadLogo = useCallback(async (file: File) => {
    if (!user || !company) return;
    const ext  = file.name.split(".").pop();
    const path = `${company.id}/logo.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from("company-logos").getPublicUrl(path);
    const logo_url = `${publicUrl}?t=${Date.now()}`;
    const { data: updated, error: updateError } = await supabase
      .from("companies")
      .update({ logo_url })
      .eq("id", company.id)
      .select(COMPANY_FIELDS)
      .single();
    if (updateError) throw updateError;
    if (updated) setCompany(updated as Company);
  }, [user, company]);

  return (
    <CompanyContext.Provider
      value={{ company, companyLoading, isFreePlan, planExpired, planDaysLeft, refetchCompany: load, updateCompany, uploadLogo }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
