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
  zapi_name?: string | null;
  zapi_connected?: boolean;
  // Meta
  created_at?: string;
}

type CompanyUpdateData = Partial<Omit<Company, "id" | "owner_id" | "plan" | "plan_expires_at">>;

interface CompanyContextType {
  company: Company | null;
  availableCompanies: Company[];
  setSelectedCompany: (c: Company) => void;
  isOwner: boolean;
  companyLoading: boolean;
  isFreePlan: boolean;
  planExpired: boolean;
  planDaysLeft: number | null;
  refetchCompany: () => void;
  updateCompany: (data: CompanyUpdateData) => Promise<void>;
  uploadLogo: (file: File) => Promise<void>;
}

const COMPANY_FIELDS = "*";
const SELECTED_COMPANY_KEY = "rz_selected_company_id";

const CompanyContext = createContext<CompanyContextType | null>(null);

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be within CompanyProvider");
  return ctx;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [availableCompanies, setAvailableCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    () => localStorage.getItem(SELECTED_COMPANY_KEY)
  );
  const [companyLoading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setAvailableCompanies([]); setLoading(false); return; }
    setLoading(true);

    const all: Company[] = [];

    // Owned companies (prefer paid plan)
    const { data: ownerRows, error: ownerError } = await supabase
      .from("companies")
      .select(COMPANY_FIELDS)
      .eq("owner_id", user.id)
      .order("plan_expires_at", { ascending: false });

    if (ownerError) console.error("[CompanyContext] owner query error:", ownerError);
    if (ownerRows) all.push(...(ownerRows as Company[]));

    // Member companies (via company_members table)
    const { data: memberRows, error: memberError } = await supabase
      .rpc("get_my_member_companies");
    if (memberError) console.error("[CompanyContext] member companies error:", memberError);
    if (memberRows) {
      for (const c of memberRows as Company[]) {
        if (!all.find(x => x.id === c.id)) all.push(c);
      }
    }

    setAvailableCompanies(all);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const selectedCompany = useMemo(() => {
    if (availableCompanies.length === 0) return null;
    if (selectedCompanyId) {
      const found = availableCompanies.find(c => c.id === selectedCompanyId);
      if (found) return found;
    }
    // Default: prefer paid plan, then first
    return availableCompanies.find(c => c.plan !== "free") ?? availableCompanies[0];
  }, [availableCompanies, selectedCompanyId]);

  const setSelectedCompany = useCallback((c: Company) => {
    setSelectedCompanyId(c.id);
    localStorage.setItem(SELECTED_COMPANY_KEY, c.id);
  }, []);

  const company = selectedCompany;

  const isOwner = company?.owner_id === user?.id;

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
    if (updated) {
      setAvailableCompanies(prev =>
        prev.map(c => c.id === (updated as Company).id ? updated as Company : c)
      );
    }
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
    if (updated) {
      setAvailableCompanies(prev =>
        prev.map(c => c.id === (updated as Company).id ? updated as Company : c)
      );
    }
  }, [user, company]);

  return (
    <CompanyContext.Provider
      value={{
        company,
        availableCompanies,
        setSelectedCompany,
        isOwner,
        companyLoading,
        isFreePlan,
        planExpired,
        planDaysLeft,
        refetchCompany: load,
        updateCompany,
        uploadLogo,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
