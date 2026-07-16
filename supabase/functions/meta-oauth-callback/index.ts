import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Facebook Login app (Messenger + Instagram via Página)
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

// Instagram Platform app (Login direto com Instagram)
const IG_APP_ID = Deno.env.get("IG_APP_ID") ?? "";
const IG_APP_SECRET = Deno.env.get("IG_APP_SECRET") ?? "";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const db = createClient(supabaseUrl, serviceKey);

    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !user) {
      console.error("Falha na auth:", userErr);
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json() as { code?: string; redirect_uri?: string; provider?: string };
    const { code, redirect_uri, provider } = body;

    if (!code || !redirect_uri || !provider) {
      return json({ error: "parâmetros obrigatórios: code, redirect_uri, provider" }, 400);
    }

    console.log("meta-oauth-callback:", { provider, user: user.id });

    const { data: company } = await db
      .from("companies")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!company) return json({ error: "empresa não encontrada" }, 404);

    // ── Fluxo Instagram Platform (Login direto com Instagram) ──────────────
    if (provider === "instagram_direct") {
      if (!IG_APP_ID || !IG_APP_SECRET) {
        return json({ error: "Instagram Platform não configurado no servidor (IG_APP_ID/IG_APP_SECRET ausentes)" }, 500);
      }

      // 1. Troca code por token de curta duração
      const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: IG_APP_ID,
          client_secret: IG_APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri,
          code,
        }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        console.error("Erro na troca de token (Instagram):", tokenData);
        return json({ error: "falha ao trocar código OAuth do Instagram", detail: tokenData.error_message ?? JSON.stringify(tokenData) }, 400);
      }

      const shortToken = tokenData.access_token as string;
      const igUserId = String(tokenData.user_id);

      // 2. Troca por token de longa duração (60 dias)
      const longRes = await fetch(
        `https://graph.instagram.com/access_token?` +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_id: IG_APP_ID,
          client_secret: IG_APP_SECRET,
          access_token: shortToken,
        })
      );
      const longData = await longRes.json();
      const longToken = (longData.access_token as string) || shortToken;

      // 3. Busca dados do perfil Instagram
      const meRes = await fetch(
        `https://graph.instagram.com/me?` +
        new URLSearchParams({ fields: "id,username,name", access_token: longToken })
      );
      const meData = await meRes.json();
      const instagramUsername = (meData.username as string) || null;

      const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

      // 4. Salva conexão
      const { data: conn, error: upsertErr } = await db
        .from("meta_connections")
        .upsert({
          owner_id: user.id,
          company_id: company.id,
          provider: "instagram",
          page_id: igUserId,
          page_name: meData.name || instagramUsername || igUserId,
          instagram_account_id: igUserId,
          instagram_username: instagramUsername,
          access_token: longToken,
          token_expires_at: tokenExpiresAt,
          active: true,
        }, { onConflict: "company_id,page_id,provider" })
        .select()
        .single();

      if (upsertErr) {
        console.error("Erro ao salvar conexão Instagram:", upsertErr);
        return json({ error: "falha ao salvar conexão", detail: upsertErr.message }, 500);
      }

      console.log("Instagram Platform conectado:", instagramUsername);

      return json({
        success: true,
        connection: {
          id: conn.id,
          provider: conn.provider,
          page_name: conn.page_name,
          instagram_username: conn.instagram_username,
        },
      });
    }

    // ── Fluxo Facebook Login (Instagram via Página + Messenger) ────────────
    if (!META_APP_ID || !META_APP_SECRET) {
      return json({ error: "configuração incompleta: META_APP_ID ou META_APP_SECRET não definidos" }, 500);
    }

    // 1. Troca code por token de curta duração
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri,
        code,
      })
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Erro na troca de token (Facebook):", tokenData);
      return json({ error: "falha ao trocar código OAuth", detail: tokenData.error?.message ?? JSON.stringify(tokenData) }, 400);
    }

    const shortToken = tokenData.access_token as string;

    // 2. Troca por token de longa duração (60 dias)
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: shortToken,
      })
    );
    const longData = await longRes.json();
    const longToken = (longData.access_token as string) || shortToken;

    // 3. Lista Páginas do Facebook + contas Instagram diretamente
    const [pagesRes, igAccountsRes] = await Promise.all([
      fetch(
        `https://graph.facebook.com/v21.0/me/accounts?` +
        new URLSearchParams({
          access_token: longToken,
          fields: "id,name,access_token,instagram_business_account",
        })
      ),
      fetch(
        `https://graph.facebook.com/v21.0/me/instagram_accounts?` +
        new URLSearchParams({
          access_token: longToken,
          fields: "id,username,name,profile_picture_url",
        })
      ),
    ]);

    const pagesData = await pagesRes.json();
    const igAccountsData = await igAccountsRes.json();

    const allPages = (pagesData.data as {
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string };
    }[]) || [];

    const directIgAccounts = (igAccountsData.data as {
      id: string;
      username: string;
      name?: string;
    }[]) || [];

    console.log("Páginas encontradas:", allPages.length, "Contas IG diretas:", directIgAccounts.length, "provider:", provider);

    if (allPages.length === 0 && directIgAccounts.length === 0) {
      return json({
        error: "no_pages",
        message: "Nenhuma Página do Facebook encontrada. Certifique-se de ser administrador de uma Página e selecioná-la no momento da autorização.",
      }, 400);
    }

    // Para Instagram: prioriza páginas com instagram_business_account vinculado;
    // se não houver, usa contas Instagram obtidas diretamente via instagram_basic.
    let eligiblePages = provider === "instagram"
      ? allPages.filter(p => p.instagram_business_account?.id)
      : allPages;

    // Fallback: se nenhuma página tem Instagram vinculado mas obtivemos contas IG diretas,
    // cria uma entrada virtual para cada conta (sem page_id de Facebook)
    if (provider === "instagram" && eligiblePages.length === 0 && directIgAccounts.length > 0) {
      console.log("Usando fallback de contas Instagram diretas:", directIgAccounts.map(a => a.username));
      const igAccount = directIgAccounts[0];
      const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

      const { data: conn, error: upsertErr } = await db
        .from("meta_connections")
        .upsert({
          owner_id: user.id,
          company_id: company.id,
          provider: "instagram",
          page_id: igAccount.id,
          page_name: igAccount.name || igAccount.username,
          instagram_account_id: igAccount.id,
          instagram_username: igAccount.username,
          access_token: longToken,
          token_expires_at: tokenExpiresAt,
          active: true,
        }, { onConflict: "company_id,page_id,provider" })
        .select()
        .single();

      if (upsertErr) {
        console.error("Erro ao salvar conexão Instagram (fallback):", upsertErr);
        return json({ error: "falha ao salvar conexão", detail: upsertErr.message }, 500);
      }

      console.log("Instagram conectado via fallback direto:", igAccount.username);
      return json({
        success: true,
        connection: {
          id: conn.id,
          provider: conn.provider,
          page_name: conn.page_name,
          instagram_username: conn.instagram_username,
        },
      });
    }

    if (eligiblePages.length === 0) {
      const pageNames = allPages.map(p => p.name).join(", ");
      return json({
        error: "no_instagram_pages",
        message: `Página(s) encontrada(s) (${pageNames || "nenhuma"}) não têm conta Instagram Business vinculada. Acesse as configurações da sua Página do Facebook → Instagram → Conectar conta, depois tente novamente.`,
      }, 400);
    }

    const page = eligiblePages[0];
    const pageAccessToken = page.access_token;
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    let instagramAccountId: string | null = null;
    let instagramUsername: string | null = null;

    if (provider === "instagram" && page.instagram_business_account?.id) {
      instagramAccountId = page.instagram_business_account.id;
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v21.0/${instagramAccountId}?` +
          new URLSearchParams({ access_token: pageAccessToken, fields: "username,name" })
        );
        const igData = await igRes.json();
        instagramUsername = igData.username || null;
      } catch (e) {
        console.error("Falha ao buscar dados do Instagram:", e);
      }
    }

    const { data: conn, error: upsertErr } = await db
      .from("meta_connections")
      .upsert({
        owner_id: user.id,
        company_id: company.id,
        provider,
        page_id: page.id,
        page_name: page.name,
        instagram_account_id: instagramAccountId,
        instagram_username: instagramUsername,
        access_token: pageAccessToken,
        token_expires_at: tokenExpiresAt,
        active: true,
      }, { onConflict: "company_id,page_id,provider" })
      .select()
      .single();

    if (upsertErr) {
      console.error("Erro ao salvar conexão:", upsertErr);
      return json({ error: "falha ao salvar conexão", detail: upsertErr.message }, 500);
    }

    // Assina página no webhook
    const webhookFields = provider === "instagram"
      ? "messages,messaging_postbacks"
      : "messages,messaging_postbacks,messaging_read";

    const subscribeRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: pageAccessToken,
          subscribed_fields: webhookFields,
        }),
      }
    );
    const subscribeData = await subscribeRes.json();
    console.log("Webhook subscription:", subscribeData);

    return json({
      success: true,
      connection: {
        id: conn.id,
        provider: conn.provider,
        page_name: conn.page_name,
        instagram_username: conn.instagram_username,
      },
    });
  } catch (err) {
    console.error("meta-oauth-callback: erro não tratado:", err);
    return json({ error: "erro interno", detail: String(err) }, 500);
  }
});
