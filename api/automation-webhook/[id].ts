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

  const contentType = req.headers.get("content-type") ?? "application/json; charset=utf-8";
  const upstreamHeaders: Record<string, string> = { "Content-Type": contentType };
  if (supabaseAnonKey) {
    upstreamHeaders["Authorization"] = `Bearer ${supabaseAnonKey}`;
    upstreamHeaders["apikey"] = supabaseAnonKey;
  }

  const upstream = await fetch(target, {
    method: "POST",
    headers: upstreamHeaders,
    body: req.body,
    // @ts-expect-error duplex required for streaming body in some runtimes
    duplex: "half",
  });

  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
