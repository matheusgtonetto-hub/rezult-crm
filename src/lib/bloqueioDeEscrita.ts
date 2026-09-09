import { emitBillingBlocked } from "@/lib/billingBlockedEvent";

/**
 * Espelho, no cliente, do bloqueio de escrita que o banco já aplica.
 *
 * ── Por que existe ──
 *
 * Quem manda de verdade é o RLS (políticas `bloqueio_cobranca_*`): com a conta
 * travada, o banco recusa a escrita mesmo que toda esta camada falhe. O papel
 * daqui é EXPLICAR -- sem isso a pessoa recebe "não foi possível criar o lead",
 * um erro genérico que não diz que o problema é o plano nem oferece a saída.
 *
 * ── Por que num ponto só ──
 *
 * O `CRMContext` já embrulha as próprias funções de escrita, mas boa parte do
 * app fala com o Supabase direto: `upsertContact`, as telas de agentes,
 * automações, integrações, configurações. Eram quinze arquivos, e a décima sexta
 * escrita nasceria sem aviso -- o mesmo raciocínio que levou o `CRMContext` a
 * guardar o objeto inteiro em vez de função por função.
 *
 * Interceptando no cliente, qualquer caminho de escrita passa por aqui, hoje e
 * depois.
 *
 * ── Por que uma lista de tabelas ──
 *
 * Bloquear tudo seria mentir na direção oposta: `profiles` e as tabelas de
 * notificação NÃO estão no RLS, de propósito -- mesmo travada, a pessoa continua
 * dona da própria conta e consegue marcar um aviso como lido. A lista abaixo é a
 * cópia exata das tabelas com política `bloqueio_cobranca_*`.
 *
 * Se uma política nova for criada no banco, o nome da tabela entra aqui. O
 * contrário (nome aqui sem política lá) bloqueia na tela algo que o servidor
 * aceitaria -- errado, e invisível até alguém reclamar.
 */
const TABELAS_BLOQUEADAS = new Set([
  "activities",
  "agent_calendar_connections",
  "agent_closer_availability",
  "agent_closers",
  "agent_knowledge_bases",
  "agent_knowledge_chunks",
  "agent_knowledge_documents",
  "agent_meta_connections",
  "agent_webhook_integrations",
  "agent_whatsapp_connections",
  "agents",
  "ai_provider_keys",
  "atendimentos",
  "automations",
  "companies",
  "company_invites",
  "company_members",
  "contacts",
  "custom_field_groups",
  "custom_field_items",
  "departments",
  "disparo_itens",
  "disparos",
  "google_calendar_connections",
  "google_oauth_tokens",
  "lead_files",
  "leads",
  "list_leads",
  "lists",
  "loss_reasons",
  "meta_connections",
  "meta_integrations",
  "meta_messages",
  "multiatendimento_attendant_settings",
  "multiatendimento_settings",
  "pipeline_columns",
  "pipeline_groups",
  "pipelines",
  "products",
  "quick_messages",
  "scheduled_followups",
  "tags",
  "tasks",
  "webhook_api_keys",
  "webhook_integrations",
  "whatsapp_connections",
  "whatsapp_conversations",
  "whatsapp_messages",
  "work_schedules",
]);

/**
 * Estado do bloqueio, fora do React.
 *
 * O cliente do Supabase é um singleton de módulo, criado antes de qualquer
 * componente existir -- ele não tem como ler um contexto. O `CompanyContext`
 * empurra o valor para cá sempre que ele muda.
 *
 * Começa em `false`: enquanto a empresa carrega não se sabe se há bloqueio, e
 * barrar por precaução recusaria escritas de conta em dia nos primeiros
 * milissegundos de cada sessão.
 */
let bloqueado = false;

export function definirBloqueioDeEscrita(valor: boolean) {
  bloqueado = valor;
}

function deveBloquear(tabela: string) {
  return bloqueado && TABELAS_BLOQUEADAS.has(tabela);
}

/**
 * O que uma escrita barrada devolve.
 *
 * Precisa se comportar como o construtor do supabase-js: aceitar a corrente
 * (`.eq().select().single()`) e ser aguardável no fim. Um Proxy que devolve a si
 * mesmo em qualquer método resolve a corrente inteira sem saber quais métodos
 * existem -- e é o que mantém isto funcionando quando a biblioteca ganhar mais
 * um.
 *
 * O formato do resultado é o mesmo de um erro normal (`{ data, error }`), então
 * o código que já trata falha continua tratando. Ninguém precisa aprender um
 * caminho novo para o caso "conta bloqueada".
 */
function respostaBloqueada() {
  const resultado = {
    data: null,
    error: {
      message: "Conta em modo somente leitura: assine um plano para voltar a editar.",
      code: "BILLING_BLOCKED",
      details: "",
      hint: "",
      name: "BillingBlockedError",
    },
  };

  const proxy: unknown = new Proxy(
    {},
    {
      get(_alvo, prop) {
        // A corrente termina quando alguém aguarda: aí entregamos o resultado.
        if (prop === "then") {
          return (aoResolver: (v: typeof resultado) => unknown, aoRejeitar?: (e: unknown) => unknown) =>
            Promise.resolve(resultado).then(aoResolver, aoRejeitar);
        }
        if (prop === "catch") return (fn: (e: unknown) => unknown) => Promise.resolve(resultado).catch(fn);
        if (prop === "finally") return (fn: () => void) => Promise.resolve(resultado).finally(fn);
        // Qualquer outro método é elo da corrente e devolve o próprio proxy.
        return () => proxy;
      },
    },
  );

  return proxy;
}

/**
 * Embrulha o construtor de uma tabela, trocando as escritas por aviso.
 *
 * Leitura passa intacta: `select` e companhia nem são mencionados aqui, e a
 * conta bloqueada continua enxergando tudo -- que é justamente a promessa feita
 * na tela ("seus dados continuam aqui").
 */
export function protegerConstrutor<T extends object>(tabela: string, construtor: T): T {
  if (!deveBloquear(tabela)) return construtor;

  return new Proxy(construtor, {
    get(alvo, prop) {
      if (prop === "insert" || prop === "update" || prop === "upsert" || prop === "delete") {
        return () => {
          emitBillingBlocked();
          return respostaBloqueada();
        };
      }
      // Sem receptor, pelo mesmo motivo do proxy do cliente: getters e métodos
      // devem rodar contra o objeto original, não contra o proxy.
      const valor = Reflect.get(alvo, prop);
      // `bind` no alvo original: os métodos do supabase-js guardam estado em
      // campos privados, e chamá-los com o proxy como `this` quebra o acesso.
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    },
  }) as T;
}
