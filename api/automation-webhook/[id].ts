export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const id = url.pathname.split("/").filter(Boolean).pop();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
  if (!supabaseUrl || !id) {
    return Response.json({ error: "Server configuration error" }, { status: 500, headers: corsHeaders });
  }

  const target = `${supabaseUrl}/functions/v1/automation-runner/webhook/${id}`;

  const upstreamHeaders: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };
  if (supabaseAnonKey) {
    upstreamHeaders["Authorization"] = `Bearer ${supabaseAnonKey}`;
    upstreamHeaders["apikey"] = supabaseAnonKey;
  }

  // Lê os bytes brutos e força decodificação UTF-8 (fallback Windows-1252 para clientes legados)
  const bodyBuffer = await req.arrayBuffer();
  let bodyText: string;
  try {
    bodyText = new TextDecoder("utf-8", { fatal: true }).decode(bodyBuffer);
  } catch {
    bodyText = new TextDecoder("windows-1252").decode(bodyBuffer);
  }

  // Encaminha para a Edge Function com 1 retry — um cold-start/hiccup transitório do
  // upstream não deve virar 500 para o chamador externo (ex: DataCrazy), que poderia
  // reenviar e duplicar. O fluxo em si é idempotente, mas evitamos o erro na origem.
  async function forward(): Promise<Response> {
    return await fetch(target, { method: "POST", headers: upstreamHeaders, body: bodyText });
  }

  let upstream: Response;
  try {
    upstream = await forward();
    if (upstream.status >= 500) {
      // Tenta uma vez mais em caso de erro transitório do upstream
      await new Promise((r) => setTimeout(r, 400));
      upstream = await forward();
    }
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 400));
      upstream = await forward();
    } catch (err) {
      return Response.json(
        { error: "Upstream unreachable", detail: String(err) },
        { status: 502, headers: corsHeaders },
      );
    }
  }

  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
