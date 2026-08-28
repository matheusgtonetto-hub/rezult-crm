// Imports por `npm:`, e não pelo esm.sh.
//
// O esm.sh entrega o pacote já convertido para o navegador e, para isso, injeta
// polyfills de Node vindos do `deno.land/std`. Esses arquivos são baixados na
// hora de empacotar a função, e o `deno.land` vinha dando timeout: em 28/08/2026
// o webhook ficou dias fora do ar sem conseguir subir por causa disso -- primeiro
// pelo import direto do std, depois por dentro do SDK da Stripe
// (esm.sh/stripe -> object-inspect -> deno.land/std/node/util.ts).
//
// O `npm:` é resolvido pelo próprio runtime, que já traz a compatibilidade com
// Node embutida. Tira o `deno.land` inteiro do grafo de dependências e o deploy
// deixa de depender de um CDN de terceiro estar respondendo.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
const serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret  = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const META_PIXEL_ID  = Deno.env.get("META_PIXEL_ID")  ?? "";
const META_CAPI_TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";

// Fábrica em vez de chamada solta: dá um tipo nomeável para passar adiante.
// ReturnType<typeof createClient> sem argumentos resolve para outra instância
// genérica e não casa com o cliente realmente criado aqui.
const criarDb = () => createClient(supabaseUrl, serviceKey);
type DB = ReturnType<typeof criarDb>;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, stripe-signature",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── Meta Conversions API ─────────────────────────────────────────────────────
async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str.toLowerCase().trim()),
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendMetaConversion(opts: {
  eventName: string;
  eventId:   string;
  email?:    string | null;
  name?:     string | null;
  value?:    number;
  currency?: string;
  planName?: string;
}) {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) {
    console.warn("[meta-capi] META_PIXEL_ID ou META_CAPI_TOKEN não configurados — evento ignorado");
    return;
  }

  const userData: Record<string, string[]> = {};
  if (opts.email) userData.em = [await sha256hex(opts.email)];
  if (opts.name) {
    const parts = opts.name.trim().split(" ");
    userData.fn = [await sha256hex(parts[0])];
    if (parts.length > 1) userData.ln = [await sha256hex(parts.slice(1).join(" "))];
  }

  const payload = {
    data: [{
      event_name:    opts.eventName,
      event_time:    Math.floor(Date.now() / 1000),
      event_id:      opts.eventId,
      action_source: "website",
      user_data:     userData,
      custom_data: {
        currency:         (opts.currency ?? "BRL").toUpperCase(),
        value:            opts.value ?? 0,
        content_name:     opts.planName ?? "",
        content_category: "subscription",
      },
    }],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    );
    const result = await res.json();
    if (!res.ok) {
      console.error("[meta-capi] erro:", JSON.stringify(result));
    } else {
      console.log(`[meta-capi] ${opts.eventName} enviado — events_received=${result.events_received}`);
    }
  } catch (err) {
    console.error("[meta-capi] falha na requisição:", err);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Statuses aceitos pelo CHECK constraint da tabela
const VALID_STATUSES = new Set(["trialing", "active", "past_due", "canceled", "unpaid"]);

function normalizeStatus(raw: string): string {
  if (VALID_STATUSES.has(raw)) return raw;
  // incomplete / incomplete_expired → active (pagamento pode ainda completar)
  console.warn(`[webhook] status Stripe inesperado "${raw}" → normalizando para "active"`);
  return "active";
}

// ── Datas da assinatura ──────────────────────────────────────────────────────
// Converte epoch em ISO SEM nunca lançar. A versão antiga chamava
// new Date(x * 1000).toISOString() direto: quando x vinha undefined o resultado
// era NaN e o toISOString derrubava o handler inteiro com "Invalid time value",
// antes mesmo de qualquer escrita no banco. Uma assinatura paga ficava com a
// data de vencimento congelada e a empresa caía em modo free no fim do ciclo.
function unixParaIso(segundos: unknown): string | null {
  if (typeof segundos !== "number" || !Number.isFinite(segundos)) return null;
  const data = new Date(segundos * 1000);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

// Quanto tempo o cliente continua escrevendo depois de uma cobrança recusada.
// A Stripe faz novas tentativas ao longo de dias e a primeira recusa costuma ser
// limite ou bloqueio do banco, não inadimplência: cortar na hora derruba cliente
// bom que voltaria a pagar sozinho. Ancorado no início do ciclo cobrado, e não em
// "agora", para que cada nova tentativa não empurre a carência para frente.
const DIAS_DE_CARENCIA = 15;

function fimDaCarencia(inicioDoCiclo: string | null): string {
  const base = inicioDoCiclo ? new Date(inicioDoCiclo) : new Date();
  return new Date(base.getTime() + DIAS_DE_CARENCIA * 24 * 60 * 60 * 1000).toISOString();
}

// A Stripe moveu current_period_start/end do objeto Subscription para os ITENS
// da assinatura na versão de API 2025-03-31.basil. O apiVersion fixado no
// construtor governa só as chamadas que NÓS fazemos; o payload que a Stripe
// ENVIA no webhook vem na versão configurada no endpoint dela. Por isso lemos
// os dois lugares em vez de assumir um formato.
function extrairPeriodo(sub: Stripe.Subscription): { inicio: string | null; fim: string | null } {
  // deno-lint-ignore no-explicit-any
  const bruto = sub as any;
  const item = bruto?.items?.data?.[0];
  return {
    inicio: unixParaIso(bruto?.current_period_start ?? item?.current_period_start),
    fim:    unixParaIso(bruto?.current_period_end   ?? item?.current_period_end),
  };
}

// Existe OUTRA assinatura da mesma empresa em dia?
//
// Quem tem o cartão recusado costuma desistir da fatura antiga e assinar de novo
// pelo /planos, o que cria uma segunda assinatura na Stripe. A antiga continua
// emitindo falha de cobrança por dias. Sem esta checagem, esses eventos velhos
// colocariam em carência (e depois bloqueariam) um cliente que voltou a pagar:
// o pior defeito possível desta funcionalidade.
async function temAssinaturaEmDia(db: DB, companyId: string, exceto: string): Promise<boolean> {
  const { data, error } = await db
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("company_id", companyId)
    .in("status", ["active", "trialing"])
    .neq("stripe_subscription_id", exceto)
    .limit(1);

  if (error) {
    // Na dúvida, não bloqueia: liberar a mais é menos grave do que cortar quem paga.
    console.error("[webhook] falha ao checar outras assinaturas:", error.message);
    return true;
  }
  return (data?.length ?? 0) > 0;
}

// Fonte única de verdade para renovação, upgrade e cancelamento agendado.
//
// Busca a assinatura na Stripe em vez de ler o corpo do evento: o retrieve sai
// na versão de API fixada no construtor, que é estável, enquanto o formato do
// evento muda quando a Stripe atualiza o endpoint. Assim uma mudança de versão
// lá não derruba a cobrança aqui de novo.
async function sincronizarAssinatura(
  db: DB,
  subId: string,
  origem: string,
  extras: { companyId?: string | null; planName?: string | null; billingPeriod?: string | null } = {},
): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subId);
  const periodo = extrairPeriodo(sub);

  if (!periodo.fim) {
    // Não sabemos até quando o plano vale: melhor não escrever nada do que
    // gravar uma data errada e bloquear (ou liberar) um cliente indevidamente.
    console.error(
      `[${origem}] período ausente em ${subId}. Campos da subscription:`,
      Object.keys(sub as Record<string, unknown>).join(","),
      "| campos do item:",
      // deno-lint-ignore no-explicit-any
      Object.keys(((sub as any)?.items?.data?.[0] ?? {}) as Record<string, unknown>).join(","),
    );
    return;
  }

  // A linha existente é o fallback para plano e empresa: numa renovação o
  // evento não carrega o metadata que o checkout carregava.
  const { data: linhaAtual } = await db
    .from("subscriptions")
    .select("company_id, plan_name, billing_period, owner_user_id")
    .eq("stripe_subscription_id", subId)
    .limit(1)
    .maybeSingle();

  const companyId = sub.metadata?.companyId
    ?? extras.companyId
    ?? (linhaAtual?.company_id as string | undefined)
    ?? null;

  const planName = extras.planName
    ?? sub.metadata?.planName
    ?? (linhaAtual?.plan_name as string | undefined)
    ?? null;

  const billingPeriod = extras.billingPeriod
    ?? sub.metadata?.billingPeriod
    ?? (linhaAtual?.billing_period as string | undefined)
    ?? null;

  if (!companyId) {
    console.error(`[${origem}] não foi possível resolver companyId para ${subId} — nada gravado`);
    return;
  }

  const dados = {
    company_id:             companyId,
    // Numa renovação o metadata pode não vir. Sem o fallback, o upsert zeraria
    // o dono que o checkout já tinha gravado.
    owner_user_id:          sub.metadata?.userId
                              ?? (linhaAtual?.owner_user_id as string | undefined)
                              ?? null,
    stripe_customer_id:     typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripe_subscription_id: subId,
    stripe_price_id:        sub.items.data[0]?.price.id ?? null,
    plan_name:              planName,
    billing_period:         billingPeriod,
    status:                 normalizeStatus(sub.status),
    trial_ends_at:          unixParaIso(sub.trial_end),
    current_period_start:   periodo.inicio,
    current_period_end:     periodo.fim,
    canceled_at:            unixParaIso(sub.canceled_at),
    updated_at:             new Date().toISOString(),
  };

  const { error: erroSub } = await db
    .from("subscriptions")
    .upsert(dados, { onConflict: "stripe_subscription_id" });

  if (erroSub) {
    console.error(`[${origem}] erro no upsert subscriptions:`, erroSub);
    throw new Error(`Upsert subscriptions falhou: ${erroSub.message}`);
  }

  // O ponto onde uma cobrança recusada virava um mês grátis.
  //
  // A Stripe avança o período da assinatura quando EMITE a fatura da renovação,
  // antes de receber o dinheiro. Gravar periodo.fim aqui sem olhar o status
  // fazia a própria falha de pagamento estender o acesso por mais um ciclo.
  // Agora a data só anda quando a assinatura está paga; nos outros casos a
  // empresa mantém a validade do último ciclo quitado e o estado de cobrança
  // passa a contar a história.
  const emDia = dados.status === "active" || dados.status === "trialing";

  const atualizacaoEmpresa: Record<string, string | null> = {};

  if (emDia) {
    atualizacaoEmpresa.plan_expires_at     = periodo.fim;
    atualizacaoEmpresa.billing_status      = "ok";
    atualizacaoEmpresa.billing_grace_until = null;
    if (planName) atualizacaoEmpresa.plan = planName;
    // Encerra o teste grátis do cadastro: a partir daqui quem manda na validade
    // é a assinatura. Sem isto a tarja continuaria contando dias de um teste que
    // já virou contrato, e o /setup seguiria interceptando quem já pagou.
    atualizacaoEmpresa.trial_ends_at       = null;
  } else if (dados.status === "past_due" || dados.status === "unpaid") {
    if (await temAssinaturaEmDia(db, companyId, subId)) {
      console.log(`[${origem}] ${subId} está ${dados.status}, mas a empresa tem outra assinatura em dia — cobrança inalterada`);
    } else if (dados.status === "past_due") {
      atualizacaoEmpresa.billing_status      = "pendente";
      atualizacaoEmpresa.billing_grace_until = fimDaCarencia(periodo.inicio);
    } else {
      // A Stripe desistiu de cobrar. Somente leitura na hora, sem esperar carência.
      atualizacaoEmpresa.billing_status      = "bloqueado";
      atualizacaoEmpresa.billing_grace_until = null;
    }
  }

  // Status sem regra definida (canceled chega pelo subscription.deleted) não
  // muda nada na empresa. Um update vazio seria rejeitado pelo PostgREST.
  if (Object.keys(atualizacaoEmpresa).length > 0) {
    const { error: erroEmpresa } = await db
      .from("companies")
      .update(atualizacaoEmpresa)
      .eq("id", companyId);

    if (erroEmpresa) {
      console.error(`[${origem}] erro ao atualizar companies:`, erroEmpresa);
      throw new Error(`Update companies falhou: ${erroEmpresa.message}`);
    }
  }

  console.log(
    `[${origem}] sincronizado ${subId}: plano=${planName} status=${dados.status}` +
    ` periodo_ate=${periodo.fim} acesso=${emDia ? `liberado ate ${periodo.fim}` : `congelado (${atualizacaoEmpresa.billing_status ?? "sem mudanca"})`}`,
  );
}

// `Deno.serve`, e não o `serve` do deno.land/std.
//
// O std é buscado pela rede na hora de empacotar a função, e essa busca dá
// timeout com frequência -- foi o que impediu este deploy em 28/08/2026, com o
// webhook fora do ar. O `Deno.serve` é nativo do runtime: não baixa nada, então
// o deploy deixa de depender de um CDN externo estar respondendo.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("[webhook] stripe-signature header ausente");
    return json({ error: "missing stripe-signature" }, 400);
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    // Erro aqui quase sempre = STRIPE_WEBHOOK_SECRET incorreto.
    // Certifique-se que o secret no Supabase é o do Dashboard → Webhooks → endpoint,
    // NÃO o secret local do "stripe listen".
    console.error("[webhook] falha na verificação de assinatura:", err);
    console.error("[webhook] DICA: confirme que STRIPE_WEBHOOK_SECRET é o signing secret do endpoint de produção no Stripe Dashboard");
    return json({ error: "invalid signature" }, 400);
  }

  console.log(`[webhook] evento recebido: ${event.type} id=${event.id}`);

  const db = criarDb();

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session       = event.data.object as Stripe.Checkout.Session;
        const companyId     = session.metadata?.companyId;
        const userId        = session.metadata?.userId;
        const planName      = session.metadata?.planName;
        const billingPeriod = session.metadata?.billingPeriod;

        console.log("[checkout.session.completed] metadata:", { companyId, userId, planName, billingPeriod });
        console.log("[checkout.session.completed] customer:", session.customer, "subscription:", session.subscription);

        if (!companyId) {
          console.error("[checkout.session.completed] companyId ausente no metadata — abortando");
          break;
        }

        const subId = session.subscription as string | null;
        if (!subId) {
          console.error("[checkout.session.completed] session.subscription é null — modo não-subscription?");
          break;
        }

        await sincronizarAssinatura(db, subId, "checkout.session.completed", {
          companyId,
          planName,
          billingPeriod,
        });

        // Dispara evento de conversão no Meta CAPI
        await sendMetaConversion({
          eventName: "Purchase",
          eventId:   session.id,
          email:     session.customer_details?.email,
          name:      session.customer_details?.name,
          value:     session.amount_total ? session.amount_total / 100 : undefined,
          currency:  session.currency ?? "BRL",
          planName,
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        console.log("[customer.subscription.updated] sub.id=", sub.id, "status=", sub.status);
        await sincronizarAssinatura(db, sub.id, "customer.subscription.updated");
        break;
      }

      // Renovação paga. É o evento canônico do ciclo mensal: antes o sistema
      // dependia só do customer.subscription.updated, então uma falha ali
      // congelava a data de vencimento sem deixar rastro no banco.
      case "invoice.payment_succeeded": {
        // deno-lint-ignore no-explicit-any
        const invoice = event.data.object as any;
        // O campo mudou de lugar entre versões da API da Stripe: era
        // invoice.subscription, virou invoice.parent.subscription_details.
        const subId: string | null =
          (typeof invoice?.subscription === "string" ? invoice.subscription : null)
          ?? invoice?.parent?.subscription_details?.subscription
          ?? invoice?.lines?.data?.[0]?.subscription
          ?? null;

        console.log("[invoice.payment_succeeded] subId=", subId, "billing_reason=", invoice?.billing_reason);

        if (!subId) {
          console.log("[invoice.payment_succeeded] fatura sem assinatura — ignorando");
          break;
        }

        await sincronizarAssinatura(db, subId, "invoice.payment_succeeded");
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        console.log("[customer.subscription.deleted] sub.id=", sub.id);

        const { data: linha } = await db
          .from("subscriptions")
          .select("company_id")
          .eq("stripe_subscription_id", sub.id)
          .limit(1)
          .maybeSingle();

        await db
          .from("subscriptions")
          .update({
            status:      "canceled",
            canceled_at: new Date().toISOString(),
            updated_at:  new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        // Metadata pode faltar no evento; a linha do banco é o fallback.
        const companyId = sub.metadata?.companyId ?? (linha?.company_id as string | undefined);
        if (companyId) {
          // Cancelar por vontade própria e ser cancelado por calote terminam no
          // mesmo status na Stripe, mas não podem terminar no mesmo lugar aqui:
          // quem cancelou o plano tem direito de continuar no free, quem não
          // pagou fica em somente leitura até regularizar.
          // deno-lint-ignore no-explicit-any
          const motivo = (sub as any)?.cancellation_details?.reason ?? null;
          const porFaltaDePagamento = motivo === "payment_failed";
          console.log("[customer.subscription.deleted] motivo=", motivo);

          await db.from("companies").update({
            plan:                "free",
            billing_status:      porFaltaDePagamento ? "bloqueado" : "ok",
            billing_grace_until: null,
          }).eq("id", companyId);
        } else {
          console.error("[customer.subscription.deleted] companyId não resolvido para", sub.id);
        }
        break;
      }

      case "invoice.payment_failed": {
        // deno-lint-ignore no-explicit-any
        const invoice = event.data.object as any;
        // Mesma mudança de lugar do payment_succeeded.
        const subId: string | null =
          (typeof invoice?.subscription === "string" ? invoice.subscription : null)
          ?? invoice?.parent?.subscription_details?.subscription
          ?? invoice?.lines?.data?.[0]?.subscription
          ?? null;
        console.log("[invoice.payment_failed] subId=", subId);
        if (subId) {
          const { data: linha } = await db
            .from("subscriptions")
            .select("company_id")
            .eq("stripe_subscription_id", subId)
            .limit(1)
            .maybeSingle();

          await db
            .from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);

          // Antes esse handler só marcava a tabela subscriptions, que nenhuma
          // tela consultava para liberar acesso: o sistema sabia da recusa e
          // não fazia nada com ela. Agora a empresa entra em carência.
          const companyId = linha?.company_id as string | undefined;
          if (companyId && await temAssinaturaEmDia(db, companyId, subId)) {
            console.log(`[invoice.payment_failed] ${subId} falhou, mas a empresa tem outra assinatura em dia — cobrança inalterada`);
          } else if (companyId) {
            await db
              .from("companies")
              .update({
                billing_status:      "pendente",
                billing_grace_until: fimDaCarencia(unixParaIso(invoice?.period_start)),
              })
              .eq("id", companyId)
              // Não rebaixa quem já está bloqueado: uma nova tentativa recusada
              // não pode devolver carência a quem a Stripe já desistiu de cobrar.
              .neq("billing_status", "bloqueado");
          } else {
            console.error("[invoice.payment_failed] companyId não resolvido para", subId);
          }
        }
        break;
      }

      default:
        console.log(`[webhook] evento ignorado: ${event.type}`);
    }
  } catch (err) {
    console.error("[webhook] erro ao processar evento:", err);
    return json({ error: "internal error" }, 500);
  }

  return json({ received: true });
});
