import {
  createContext, useContext, useEffect, useState,
  useCallback, useMemo, ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { PLAN_LIMITS, PAID_PLANS, planoEmVigor } from "@/data/plans";
import { emitPlanLimit } from "@/lib/planLimitEvent";

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
  // Estado da cobrança, escrito pelo stripe-webhook. Separado do plano de
  // propósito: "que plano ele contratou" e "ele está pagando" são perguntas
  // diferentes, e tratá-las como uma só foi o que deixou uma cobrança recusada
  // renovar o acesso por mais um mês.
  billing_status?: "ok" | "pendente" | "bloqueado";
  billing_grace_until?: string | null;
  // Fim do teste grátis do cadastro, sem cartão. Nulo para quem nunca testou ou
  // já assinou. Não confundir com subscriptions.trial_ends_at, que é o trial da
  // Stripe, com cartão já informado.
  trial_ends_at?: string | null;
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

export type WhatsAppProvider = "dapi" | "zapi" | "cloud_api";

export interface WhatsAppConnection {
  id: string;
  name: string;
  provider: WhatsAppProvider;
  // Z-API
  instanceId: string;
  token: string;
  clientToken?: string | null;
  // Cloud API (Meta) — Embedded Signup
  phoneNumberId?: string | null;
  wabaId?: string | null;
  accessToken?: string | null;
  phone?: string | null;
  connected: boolean;
  active: boolean;
  createdAt: string;
}

function mapConn(r: Record<string, unknown>): WhatsAppConnection {
  return {
    id:            r.id as string,
    name:          (r.name as string) || "WhatsApp",
    provider:      ((r.provider as string) || "zapi") as WhatsAppProvider,
    instanceId:    (r.instance_id as string) ?? "",
    token:         (r.token as string) ?? "",
    clientToken:   r.client_token as string | null,
    phoneNumberId: r.phone_number_id as string | null,
    wabaId:        r.waba_id as string | null,
    accessToken:   r.access_token as string | null,
    phone:         r.phone as string | null,
    connected:     r.connected as boolean,
    active:        r.active as boolean,
    createdAt:     r.created_at as string,
  };
}

interface CompanyContextType {
  company: Company | null;
  availableCompanies: Company[];
  setSelectedCompany: (c: Company) => void;
  isOwner: boolean;
  userPermissions: string[];
  companyLoading: boolean;
  permissionsReady: boolean;
  isFreePlan: boolean;
  planExpired: boolean;
  planDaysLeft: number | null;
  billingBlocked: boolean;
  motivoDoBloqueio: "cobranca" | "teste" | null;
  isTrialing: boolean;
  planoEfetivo: string;
  refetchCompany: () => void;
  updateCompany: (data: CompanyUpdateData) => Promise<void>;
  uploadLogo: (file: File) => Promise<void>;
  whatsappConnections: WhatsAppConnection[];
  addWhatsAppConnection: (data: Omit<WhatsAppConnection, "id" | "createdAt">) => Promise<WhatsAppConnection>;
  updateWhatsAppConnection: (id: string, data: Partial<Omit<WhatsAppConnection, "id" | "createdAt">>) => Promise<void>;
  removeWhatsAppConnection: (id: string) => Promise<void>;
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
  const [whatsappConnections, setWhatsappConnections] = useState<WhatsAppConnection[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [permissionsReady, setPermissionsReady] = useState(false);

  // Precisa vir antes de addWhatsAppConnection, que depende dela no closure.
  const selectedCompany = useMemo(() => {
    if (availableCompanies.length === 0) return null;
    if (selectedCompanyId) {
      const found = availableCompanies.find(c => c.id === selectedCompanyId);
      if (found) return found;
    }
    // Default: prefer paid plan, then first
    return availableCompanies.find(c => c.plan !== "free") ?? availableCompanies[0];
  }, [availableCompanies, selectedCompanyId]);

  const loadConnections = useCallback(async () => {
    if (!user) { setWhatsappConnections([]); return; }
    const { data, error } = await supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });
    if (!error && data) setWhatsappConnections((data as Record<string, unknown>[]).map(mapConn));
  }, [user?.id]);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const addWhatsAppConnection = useCallback(async (data: Omit<WhatsAppConnection, "id" | "createdAt">): Promise<WhatsAppConnection> => {
    if (!user) throw new Error("Não autenticado");

    // planoEmVigor, e não selectedCompany.plan: com o teste grátis dando plano
    // pago por 7 dias, ler a coluna direto manteria o limite do Silver depois
    // de o teste vencer.
    const limit = PLAN_LIMITS[planoEmVigor(selectedCompany)]?.connections ?? null;
    if (limit !== null && whatsappConnections.length >= limit) {
      emitPlanLimit("conexões");
      throw new Error("plan-limit");
    }

    const { data: row, error } = await supabase
      .from("whatsapp_connections")
      .insert({
        owner_id:        user.id,
        company_id:      selectedCompany?.id ?? null,
        name:            data.name,
        provider:        data.provider ?? "zapi",
        instance_id:     data.instanceId || null,
        token:           data.token || null,
        client_token:    data.clientToken ?? null,
        phone_number_id: data.phoneNumberId ?? null,
        waba_id:         data.wabaId ?? null,
        access_token:    data.accessToken ?? null,
        phone:           data.phone ?? null,
        connected:       data.connected,
        active:          data.active,
      })
      .select()
      .single();
    if (error) throw error;
    const conn = mapConn(row as Record<string, unknown>);
    setWhatsappConnections(prev => [...prev, conn]);
    return conn;
  }, [user, selectedCompany, whatsappConnections]);

  const updateWhatsAppConnection = useCallback(async (id: string, data: Partial<Omit<WhatsAppConnection, "id" | "createdAt">>) => {
    const payload: Record<string, unknown> = {};
    if (data.name          !== undefined) payload.name            = data.name;
    if (data.provider      !== undefined) payload.provider        = data.provider;
    if (data.instanceId    !== undefined) payload.instance_id     = data.instanceId || null;
    if (data.token         !== undefined) payload.token           = data.token || null;
    if (data.clientToken   !== undefined) payload.client_token    = data.clientToken;
    if (data.phoneNumberId !== undefined) payload.phone_number_id = data.phoneNumberId;
    if (data.wabaId        !== undefined) payload.waba_id         = data.wabaId;
    if (data.accessToken   !== undefined) payload.access_token    = data.accessToken;
    if (data.phone         !== undefined) payload.phone           = data.phone;
    if (data.connected     !== undefined) payload.connected       = data.connected;
    if (data.active        !== undefined) payload.active          = data.active;
    const { error } = await supabase.from("whatsapp_connections").update(payload).eq("id", id);
    if (error) throw error;
    setWhatsappConnections(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);

  const removeWhatsAppConnection = useCallback(async (id: string) => {
    await supabase.from("whatsapp_connections").delete().eq("id", id);
    setWhatsappConnections(prev => prev.filter(c => c.id !== id));
  }, []);

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

  const setSelectedCompany = useCallback((c: Company) => {
    setSelectedCompanyId(c.id);
    localStorage.setItem(SELECTED_COMPANY_KEY, c.id);
  }, []);

  const company = selectedCompany;

  const isOwner = company?.owner_id === user?.id;

  useEffect(() => {
    setPermissionsReady(false);
    if (!company || !user) { setUserPermissions([]); setPermissionsReady(true); return; }
    if (company.owner_id === user.id) { setUserPermissions(["admin"]); setPermissionsReady(true); return; }
    supabase
      .from("company_members")
      .select("permissions")
      .eq("company_id", company.id)
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setUserPermissions((data?.permissions as string[]) ?? []);
        setPermissionsReady(true);
      });
  }, [company?.id, user?.id]);

  const planExpired = useMemo(() => {
    if (!company) return false;
    return new Date(company.plan_expires_at) < new Date();
  }, [company]);

  // isFreePlan = true quando não há empresa, plano não é pago, ou plano pago expirou
  const isFreePlan = !company || !PAID_PLANS.includes(company.plan ?? "") || planExpired;

  // Espelha public.empresa_bloqueada() do banco. A trava que vale é o RLS: se
  // este cálculo divergir, o servidor ainda recusa a escrita. O papel dele aqui
  // é a tela explicar o motivo em vez de devolver "erro ao salvar".
  //
  // São duas portas para o mesmo estado de somente leitura, e o texto que a
  // pessoa lê depende de qual delas fechou: quem teve o teste encerrado nunca
  // teve cobrança nenhuma, e falar em "pagamento recusado" com ela seria mentira.
  //
  // A checagem do teste não consulta assinaturas, ao contrário da função no
  // banco: o webhook zera trial_ends_at assim que uma assinatura fica em dia, e
  // a tela de sucesso do checkout recarrega a empresa logo depois.
  const motivoDoBloqueio = useMemo<"cobranca" | "teste" | null>(() => {
    if (!company) return null;

    const porCobranca =
      company.billing_status === "bloqueado"
      || (company.billing_status === "pendente"
          && !!company.billing_grace_until
          && new Date(company.billing_grace_until) < new Date());
    if (porCobranca) return "cobranca";

    const testeEncerrado =
      !!company.trial_ends_at && new Date(company.trial_ends_at) < new Date();
    return testeEncerrado ? "teste" : null;
  }, [company]);

  const billingBlocked = motivoDoBloqueio !== null;

  // Empresa em teste grátis: ganhou plano pago no cadastro, sem cartão, e ainda
  // está dentro do prazo. Some sozinho quando a data passa, e o webhook zera o
  // campo assim que uma assinatura entra.
  const isTrialing = useMemo(() => {
    if (!company?.trial_ends_at) return false;
    return new Date(company.trial_ends_at) > new Date();
  }, [company]);

  // O plano que vale agora. Toda consulta a PLAN_LIMITS deve passar por aqui:
  // a coluna `plan` continua dizendo "silver" depois de vencer, e ler ela direto
  // era o que mantinha o limite do plano pago numa conta expirada.
  const planoEfetivo = useMemo(() => planoEmVigor(company), [company]);

  // Antes só contava para plano "free", que nunca foi o caso de ninguém em
  // teste, e o resultado não era exibido em lugar nenhum. Agora vale para
  // qualquer plano com data futura e alimenta a tarja do teste grátis.
  const planDaysLeft = useMemo(() => {
    if (!company || planExpired) return null;
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
        userPermissions,
        companyLoading,
        permissionsReady,
        isFreePlan,
        planExpired,
        planDaysLeft,
        billingBlocked,
        motivoDoBloqueio,
        isTrialing,
        planoEfetivo,
        refetchCompany: load,
        updateCompany,
        uploadLogo,
        whatsappConnections,
        addWhatsAppConnection,
        updateWhatsAppConnection,
        removeWhatsAppConnection,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
