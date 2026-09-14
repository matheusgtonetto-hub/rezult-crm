import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarEventoMeta } from "../_shared/meta-capi.ts";

/**
 * StartTrial para a Meta, pelo servidor, e gravação da origem da empresa.
 *
 * Chamada pelo app logo depois de criar a empresa (lib/atribuicao.ts). O mesmo
 * evento sai pelo pixel no navegador com o mesmo event_id, e a Meta deduplica.
 *
 * verify_jwt fica no padrão (ligado): só quem tem sessão chama. E a função
 * confere que a empresa é do usuário da sessão, para ninguém disparar
 * conversão em nome de outra conta. O e-mail usado no evento vem da sessão,
 * nunca do corpo.
 *
 * Nada aqui pode quebrar o cadastro: o app não espera esta resposta, e se as
 * colunas de atribuição ainda não existirem no banco o evento sai assim mesmo.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const CAMPOS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"] as const;

function limpar(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ erro: "sem sessão" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: auth, error: erroAuth } = await db.auth.getUser(token);
  if (erroAuth || !auth?.user) return json({ erro: "sessão inválida" }, 401);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "corpo inválido" }, 400);
  }

  const companyId = limpar(corpo.company_id, 64);
  if (!companyId) return json({ erro: "company_id ausente" }, 400);

  const { data: empresa } = await db.from("companies").select("id, owner_id").eq("id", companyId).maybeSingle();
  if (!empresa || empresa.owner_id !== auth.user.id) return json({ erro: "empresa não pertence ao usuário" }, 403);

  const atrib = (corpo.atribuicao ?? {}) as Record<string, unknown>;
  const linha: Record<string, string | null> = {};
  for (const k of CAMPOS) linha[k] = limpar(atrib[k]);
  const secao = limpar(atrib.rz_secao, 80);

  if (CAMPOS.some((k) => linha[k]) || secao) {
    const { error } = await db
      .from("companies")
      .update({ ...linha, secao_origem: secao, atribuicao_capturada_em: new Date().toISOString() })
      .eq("id", companyId);
    // Colunas ainda não migradas: registra e segue. O evento para a Meta não
    // depende delas.
    if (error) console.warn("[meta-evento-trial] origem não gravada:", error.message);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

  const resultado = await enviarEventoMeta({
    nome: "StartTrial",
    eventId: limpar(corpo.event_id, 100) ?? `trial_${companyId}`,
    urlOrigem: limpar(corpo.event_source_url, 500) ?? undefined,
    email: auth.user.email,
    nomeCompleto: limpar(corpo.nome, 120),
    telefone: limpar(corpo.telefone, 40),
    idExterno: companyId,
    fbp: limpar(corpo.fbp, 200),
    fbc: limpar(corpo.fbc, 500),
    ip,
    userAgent: req.headers.get("user-agent"),
    customData: { currency: "BRL", value: 0, content_name: "trial_silver" },
  });

  console.log(`[meta-evento-trial] empresa=${companyId} capi=${resultado.enviado} ${resultado.detalhe}`);
  return json({ ok: true, capi: resultado.enviado });
});
