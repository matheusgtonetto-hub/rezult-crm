import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WA_APP_ID     = Deno.env.get("WA_APP_ID")     ?? "";
const WA_APP_SECRET = Deno.env.get("WA_APP_SECRET") ?? "";
const REDIRECT_URI  = "https://app.rezultcrm.com/whatsapp-callback";

const supabaseUrl    = Deno.env.get("SUPABASE_URL")              ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "não autorizado" }, 401);

    const db = createClient(supabaseUrl, serviceRoleKey);

    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !user) return json({ error: "sessão inválida" }, 401);

    const body = await req.json() as { code?: string; waba_id?: string; company_id?: string };
    const { code, waba_id, company_id } = body;

    if (!code)       return json({ error: "parâmetro 'code' ausente" }, 400);
    if (!company_id) return json({ error: "parâmetro 'company_id' ausente" }, 400);

    if (!WA_APP_ID || !WA_APP_SECRET) {
      return json({ error: "WA_APP_ID / WA_APP_SECRET não configurados no servidor" }, 500);
    }

    // 1. Troca code por token de curta duração
    const shortRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      new URLSearchParams({ client_id: WA_APP_ID, client_secret: WA_APP_SECRET, redirect_uri: REDIRECT_URI, code })
    );
    const shortData = await shortRes.json();

    if (!shortData.access_token) {
      console.error("Falha na troca de code:", shortData);
      return json({ error: "falha ao trocar código OAuth com a Meta", detail: shortData.error?.message ?? JSON.stringify(shortData) }, 400);
    }

    // 2. Troca por token de longa duração (~60 dias)
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      new URLSearchParams({ grant_type: "fb_exchange_token", client_id: WA_APP_ID, client_secret: WA_APP_SECRET, fb_exchange_token: shortData.access_token })
    );
    const longData  = await longRes.json();
    const token     = (longData.access_token as string) || (shortData.access_token as string);

    // 3. Descobre o WABA (usa o do body ou busca via /me/whatsapp_business_accounts)
    let wabaId = waba_id ?? null;

    if (!wabaId) {
      const wabaRes = await fetch(
        `https://graph.facebook.com/v21.0/me/whatsapp_business_accounts?access_token=${token}`
      );
      const wabaData = await wabaRes.json();
      const firstWaba = (wabaData.data as { id: string }[] | undefined)?.[0];
      wabaId = firstWaba?.id ?? null;
    }

    if (!wabaId) return json({ error: "nenhuma conta WhatsApp Business encontrada para o token" }, 400);

    // 4. Assina o WABA no webhook do app
    await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token }),
    });

    // 5. Busca números de telefone do WABA
    const phonesRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?` +
      new URLSearchParams({ fields: "id,display_phone_number,verified_name,quality_rating,status", access_token: token })
    );
    const phonesData = await phonesRes.json();
    const phones = (phonesData.data as {
      id: string;
      display_phone_number: string;
      verified_name: string;
      quality_rating: string;
      status: string;
    }[]) ?? [];

    console.log(`WABA ${wabaId}: ${phones.length} número(s) encontrado(s)`);

    // 6. Salva cada número como conexão (upsert por company_id + instance_id)
    const results: string[] = [];

    for (const phone of phones) {
      const { error: upsertErr } = await db.from("whatsapp_connections").upsert(
        {
          owner_id:        user.id,
          company_id,
          provider:        "cloud_api",
          name:            phone.verified_name || phone.display_phone_number,
          phone:           phone.display_phone_number,
          instance_id:     phone.id,        // phone_number_id — usado pelo webhook e pelo runner
          token,                            // access token — usado para enviar mensagens
          phone_number_id: phone.id,
          waba_id:         wabaId,
          access_token:    token,
          connected:       phone.status === "CONNECTED",
          active:          true,
        },
        { onConflict: "company_id,instance_id" }
      );

      if (upsertErr) {
        console.error(`Erro ao salvar número ${phone.id}:`, upsertErr);
      } else {
        results.push(phone.display_phone_number);
      }
    }

    return json({ success: true, phones_connected: results });
  } catch (err) {
    console.error("whatsapp-embedded-callback: erro não tratado:", err);
    return json({ error: "erro interno", detail: String(err) }, 500);
  }
});
