import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WhatsappCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company, refetchCompany } = useCompany();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function handle() {
      const code  = params.get("code");
      const wabaId = params.get("waba_id") || params.get("business_id");
      const error = params.get("error");

      if (error) {
        setErrorMsg(params.get("error_description") ?? "Conexão cancelada pelo usuário.");
        setStatus("error");
        return;
      }

      if (!code) {
        setErrorMsg("Parâmetro de autorização ausente.");
        setStatus("error");
        return;
      }

      if (!user || !company?.id) {
        setErrorMsg("Sessão expirada. Faça login novamente.");
        setStatus("error");
        return;
      }

      try {
        const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey      = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-embedded-callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({ code, waba_id: wabaId, company_id: company.id }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        await refetchCompany();
        setStatus("success");
        toast.success("WhatsApp conectado com sucesso!");
        setTimeout(() => navigate("/configuracoes"), 2500);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Erro desconhecido.");
        setStatus("error");
      }
    }

    handle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-base font-medium text-foreground">Conectando sua conta WhatsApp...</p>
            <p className="text-sm text-muted-foreground">Aguarde um momento.</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-base font-semibold text-foreground">WhatsApp conectado!</p>
            <p className="text-sm text-muted-foreground">Redirecionando para as configurações...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-destructive" />
            <p className="text-base font-semibold text-foreground">Erro ao conectar</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button onClick={() => navigate("/configuracoes")} className="mt-2">
              Voltar para Configurações
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
