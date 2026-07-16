import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function MetaCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando sua conta...");
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDescription || "Autorização cancelada.");
      setTimeout(() => navigate("/configuracoes/conexoes"), 3000);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("Código de autorização não encontrado.");
      setTimeout(() => navigate("/configuracoes/conexoes"), 3000);
      return;
    }

    const provider = (sessionStorage.getItem("meta_oauth_provider") as "instagram" | "messenger") || "instagram";
    sessionStorage.removeItem("meta_oauth_provider");

    const redirectUri = `${window.location.origin}/auth/meta-callback`;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("error");
        setMessage("Sessão expirada. Faça login novamente.");
        setTimeout(() => navigate("/login"), 3000);
        return;
      }

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        const res = await fetch(`${supabaseUrl}/functions/v1/meta-oauth-callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({ code, redirect_uri: redirectUri, provider }),
        });

        let data: Record<string, unknown> = {};
        try {
          data = await res.json();
        } catch {
          // resposta não é JSON
        }

        if (!res.ok || !data?.success) {
          const msg = (data?.message as string) || (data?.error as string) || `Erro ${res.status}: Falha ao conectar. Tente novamente.`;
          setStatus("error");
          setMessage(msg);
          toast.error(msg);
          setTimeout(() => navigate("/configuracoes/conexoes"), 4000);
          return;
        }

        const conn = data.connection as { page_name?: string; instagram_username?: string };
        const label = provider === "instagram"
          ? `@${conn.instagram_username || conn.page_name}`
          : conn.page_name;

        setStatus("success");
        setMessage(`${label} conectado com sucesso!`);
        toast.success(`${label} conectado com sucesso!`);
        setTimeout(() => navigate("/configuracoes/conexoes"), 2500);
      } catch (err) {
        const msg = err instanceof Error ? `Erro de rede: ${err.message}` : "Erro de rede ao conectar.";
        setStatus("error");
        setMessage(msg);
        toast.error(msg);
        setTimeout(() => navigate("/configuracoes/conexoes"), 4000);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
        {status === "loading" && (
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        )}
        {status === "success" && (
          <CheckCircle className="w-10 h-10 text-green-500" />
        )}
        {status === "error" && (
          <XCircle className="w-10 h-10 text-destructive" />
        )}
        <p className="text-sm text-muted-foreground">{message}</p>
        {status !== "loading" && (
          <p className="text-xs text-muted-foreground/60">Redirecionando...</p>
        )}
      </div>
    </div>
  );
}
