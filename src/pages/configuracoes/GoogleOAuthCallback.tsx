import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// Captura o code ANTES de qualquer lifecycle do React — o Supabase pode
// limpar o ?code= da URL via history.replaceState ao detectar o parâmetro
// no fluxo PKCE, então precisamos ler aqui, na inicialização do módulo.
const _params       = new URLSearchParams(window.location.search);
const _initialCode  = _params.get("code");
const _initialError = _params.get("error");

function parseCompanyId(): string | null {
  const raw = _params.get("state");
  if (!raw) return null;
  try { return (JSON.parse(atob(raw)) as { companyId?: string }).companyId ?? null; } catch { return null; }
}
const _companyId = parseCompanyId();

async function exchangeCode(code: string, companyId: string | null): Promise<void> {
  console.log("[OAuth] Chamando Edge Function com code:", code.slice(0, 12) + "...");

  const { data, error } = await supabase.functions.invoke("google-oauth-exchange", {
    body: { code, company_id: companyId },
  });

  console.log("[OAuth] Resposta da Edge Function — data:", data, "error:", error);

  if (error) {
    // supabase-js esconde o corpo da resposta de erro em error.context (um Response).
    // Lemos o detail real retornado pela Edge Function para diagnóstico.
    let detail = "";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.text === "function") {
      try {
        const raw = await ctx.text();
        try {
          const parsed = JSON.parse(raw) as { error?: string; detail?: string };
          detail = [parsed.error, parsed.detail].filter(Boolean).join(" — ");
        } catch {
          detail = raw;
        }
      } catch { /* ignore */ }
    }
    console.error("[OAuth] Detalhe do erro da Edge Function:", detail || "(sem corpo)");
    throw new Error(detail ? `${error.message}: ${detail}` : error.message);
  }
}

export default function GoogleOAuthCallback() {
  const navigate = useNavigate();
  const ran      = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code  = _initialCode;
    const error = _initialError;

    console.log("[OAuth] code capturado:", code ? code.slice(0, 12) + "..." : "VAZIO");
    console.log("[OAuth] error capturado:", error ?? "nenhum");

    if (error) {
      setErrorMsg(`Erro retornado pelo Google: ${error}`);
      return;
    }

    if (!code) {
      setErrorMsg("Código de autorização não encontrado na URL.");
      return;
    }

    exchangeCode(code, _companyId)
      .then(() => {
        toast.success("Google conectado com sucesso!");
        navigate("/configuracoes/conexoes", { replace: true });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        console.error("[OAuth] Falha na troca do code:", msg);
        setErrorMsg(msg);
      });
  }, [navigate]);

  if (errorMsg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-destructive font-medium">Erro ao conectar com o Google</p>
        <p className="text-xs text-muted-foreground max-w-sm text-center">{errorMsg}</p>
        <button
          onClick={() => navigate("/configuracoes/conexoes", { replace: true })}
          className="text-sm text-primary underline"
        >
          Voltar para Conexões
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-sm text-muted-foreground">Conectando com o Google…</p>
    </div>
  );
}
