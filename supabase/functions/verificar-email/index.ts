import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Diz à tela de cadastro se um e-mail já tem conta e se ela foi confirmada.
 *
 * Só o servidor enxerga essa diferença. Do navegador, `signup` e `resend`
 * respondem 200 sem erro nos dois casos -- é a proteção do Supabase contra
 * enumeração de e-mails --, e sem separá-los a tela manda a pessoa esperar um
 * código que nunca vai chegar quando a conta já está confirmada.
 *
 * A leitura de `auth.users` mora na função SQL `estado_do_email`, cujo EXECUTE
 * é revogado de anon e authenticated. Esta função é a única porta, e roda com
 * service role.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // `x-client-info` e `x-supabase-api-version` são mandados pelo supabase-js em
  // toda chamada. Sem eles na lista, o navegador barra a requisição no
  // preflight e a função nem chega a ser executada.
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * Freio por IP: no máximo 10 consultas por minuto.
 *
 * A resposta daqui confirma se um e-mail tem conta, então sem freio a função
 * vira uma lista de clientes para quem tiver uma lista de e-mails e paciência.
 * Dez por minuto é folgado para uma pessoa preenchendo um formulário e
 * inviável para varredura.
 *
 * O contador é da instância, não global: o runtime pode ter várias, e quem
 * insistir passa por mais de uma. É um freio, não um portão -- para um portão
 * de verdade o contador teria que morar no banco, e aí cada cadastro pagaria
 * uma escrita a mais.
 */
const JANELA_MS = 60_000;
const LIMITE = 10;
const acessos = new Map<string, number[]>();

function excedeuOLimite(ip: string): boolean {
  const agora = Date.now();
  const recentes = (acessos.get(ip) ?? []).filter(t => agora - t < JANELA_MS);
  recentes.push(agora);
  acessos.set(ip, recentes);
  return recentes.length > LIMITE;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconhecido";
  if (excedeuOLimite(ip)) return json({ error: "too many requests" }, 429);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const email = body.email?.trim();
  if (!email) return json({ error: "missing email" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("estado_do_email", { p_email: email });

  if (error) {
    console.error("estado_do_email:", error);
    return json({ error: "lookup failed" }, 500);
  }

  // A função devolve uma linha; sem ela, o honesto é dizer que não sabe, e a
  // tela segue pelo caminho de antes em vez de afirmar que o e-mail é novo.
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return json({ error: "lookup failed" }, 500);

  return json({ existe: !!linha.existe, confirmado: !!linha.confirmado });
});
