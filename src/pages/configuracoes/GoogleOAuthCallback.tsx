import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function GoogleOAuthCallback() {
  const navigate  = useNavigate();
  const ran       = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setError("Código de autorização não encontrado na URL.");
      return;
    }

    supabase.functions
      .invoke("google-oauth-exchange", { body: { code } })
      .then(({ error: fnErr }) => {
        if (fnErr) throw fnErr;
        toast.success("Google conectado com sucesso!");
        navigate("/configuracoes/conexoes", { replace: true });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      });
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-destructive font-medium">Erro ao conectar com o Google</p>
        <p className="text-xs text-muted-foreground max-w-sm text-center">{error}</p>
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
