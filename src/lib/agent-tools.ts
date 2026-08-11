// Catálogo de ferramentas que um agente de IA pode usar sobre o CRM.
// Fonte única pra aba "Ferramentas" (AgentesPage.tsx). O backend
// (supabase/functions/_shared/agent-tools.ts) espelha os mesmos `id` — os
// dois arquivos precisam ficar em sincronia manual (Deno edge functions não
// importam de src/).
//
// `implemented: false` = a ferramenta aparece selecionável na UI, mas o
// agent-sds-qualify ainda não tem o handler pronto — chamada retorna erro
// tratado, nunca quebra a conversa. Vai sendo completado em lotes.
//
// "Tipos de Atividade" (Listar/Consultar/Criar/Atualizar/Excluir) foi
// deixado de fora -- não existe tabela activity_types no rezult-crm hoje,
// `activities.type` é um valor fixo (reunião/ligação/email/tarefa/nota).
//
// "Campos Adicionais de Lead/Negócio/Empresa" virou 1 grupo só -- nesse CRM
// negócio = lead (mesma linha), e custom_field_groups não tem coluna de
// escopo separando lead/negócio/empresa.
//
// Os "Consultar X pelo ID" de catálogo (produto, tag, lista, campo, motivo,
// horário, departamento, conexão, atendente) foram aposentados. Devolviam a
// mesma linha que o "Listar X" já traz inteira, e eram justamente as que
// exigiam um uuid: como o modelo enxerga a conversa e não o banco, cada uma
// delas só funcionava se o usuário tivesse marcado junto a ferramenta de
// listar correspondente. Dependência invisível na tela, que virava agente
// dizendo ao lead que "não conseguiu". Hoje nenhuma ferramenta pede id: as
// que apontam pra outra tabela aceitam o NOME e, quando não acham, devolvem
// as opções válidas pro modelo corrigir na mesma resposta.

export type AgentToolCategory = "leitura" | "acao" | "destrutiva";

export type AgentToolDef = {
  id: string;
  label: string;
  description: string;
  category: AgentToolCategory;
  entity: string;
  implemented: boolean;
};

export const AGENT_TOOL_CATEGORY_LABELS: Record<AgentToolCategory, string> = {
  leitura: "Leitura", acao: "Ação", destrutiva: "Destrutiva",
};

export const AGENT_TOOL_CATEGORY_STYLES: Record<AgentToolCategory, { bg: string; fg: string }> = {
  leitura:   { bg: "#F5F5F5", fg: "#666666" },
  acao:      { bg: "#E1F5EE", fg: "#128A68" },
  destrutiva: { bg: "#FEE2E2", fg: "#991B1B" },
};

export const AGENT_TOOLS: AgentToolDef[] = [
  // ── Leads ──────────────────────────────────────────────────────────────
  { id: "listar_leads",              label: "Listar Leads",                     description: "Lista leads com filtros opcionais e paginação",                              category: "leitura", entity: "Leads", implemented: true },
  { id: "consultar_lead",            label: "Consultar Lead",                   description: "Recupera um lead específico pelo ID com todas as suas informações",          category: "leitura", entity: "Leads", implemented: true },
  { id: "criar_lead",                label: "Criar Lead",                       description: "Cria um novo lead no CRM com informações de contato, endereço e tags",       category: "acao",    entity: "Leads", implemented: true },
  { id: "atualizar_lead_info",       label: "Atualizar Informações do Lead",    description: "Atualiza as informações básicas de um lead existente",                       category: "acao",    entity: "Leads", implemented: true },
  { id: "atualizar_lead_endereco",   label: "Atualizar Endereço do Lead",       description: "Atualiza o endereço de um lead existente",                                    category: "acao",    entity: "Leads", implemented: true },
  { id: "atualizar_lead_contatos",   label: "Atualizar Contatos do Lead",       description: "Atualiza os contatos de um lead existente",                                   category: "acao",    entity: "Leads", implemented: true },
  { id: "atualizar_lead_notas",      label: "Atualizar Notas do Lead",          description: "Acrescenta uma anotação datada ao lead, sem apagar o que já estava escrito",                                      category: "acao",    entity: "Leads", implemented: true },
  { id: "definir_campo_adicional_lead", label: "Definir Campo Adicional do Lead", description: "Preenche um campo adicional do lead pelo nome do campo",                          category: "acao",    entity: "Leads", implemented: true },
  { id: "atualizar_atendente_lead",  label: "Atualizar Atendente do Lead",      description: "Troca o responsável do lead pelo nome do atendente",                      category: "acao",    entity: "Leads", implemented: true },
  { id: "listar_negocios_do_lead",   label: "Listar Negócios do Lead",          description: "Lista todos os negócios/oportunidades de um lead específico",                category: "leitura", entity: "Leads", implemented: true },
  { id: "excluir_lead",              label: "Excluir Lead",                     description: "Exclui um lead do CRM",                                                       category: "destrutiva", entity: "Leads", implemented: false },
  { id: "adicionar_tag_lead",        label: "Adicionar Tag ao Lead",            description: "Adiciona ao lead uma tag que já exista no CRM",                                        category: "acao",    entity: "Leads", implemented: true },
  { id: "remover_tag_lead",          label: "Remover Tag do Lead",              description: "Remove uma tag de um lead existente",                                         category: "acao",    entity: "Leads", implemented: true },
  { id: "adicionar_lead_lista",      label: "Adicionar Lead à Lista",           description: "Adiciona um lead a uma lista existente",                                      category: "acao",    entity: "Leads", implemented: false },
  { id: "remover_lead_lista",        label: "Remover Lead da Lista",            description: "Remove um lead de uma lista existente",                                       category: "acao",    entity: "Leads", implemented: false },

  // ── Negócios ───────────────────────────────────────────────────────────
  { id: "criar_negocio",               label: "Criar Negócio",                   description: "Cria um negócio no funil. Sem funil informado, usa o do negócio da conversa",                    category: "acao",    entity: "Negócios", implemented: true },
  { id: "listar_negocios_por_estagio", label: "Listar Negócios por Estágio",     description: "Lista os negócios que estão numa etapa do funil, pelo nome da etapa",       category: "leitura", entity: "Negócios", implemented: true },
  { id: "listar_negocios_por_atendente", label: "Listar Negócios por Atendente", description: "Lista os negócios de um atendente, pelo nome dele",       category: "leitura", entity: "Negócios", implemented: true },
  { id: "mover_negocio_estagio",       label: "Mover Negócio de Estágio",        description: "Move o negócio para outra etapa do funil, pelo nome da etapa",             category: "acao",    entity: "Negócios", implemented: true },
  { id: "ganhar_negocio",              label: "Ganhar Negócio",                  description: "Marca um negócio/oportunidade como ganho",                                category: "acao",    entity: "Negócios", implemented: true },
  { id: "perder_negocio",              label: "Perder Negócio",                  description: "Marca o negócio como perdido, com motivo opcional pelo nome",                              category: "acao",    entity: "Negócios", implemented: true },
  { id: "atualizar_atendente_negocio", label: "Atualizar Atendente do Negócio",  description: "Troca o responsável do negócio pelo nome do atendente",               category: "acao",    entity: "Negócios", implemented: true },
  { id: "adicionar_produto_negocio",   label: "Adicionar Produto ao Negócio",    description: "Associa um produto ao negócio, pelo nome do produto",                           category: "acao",    entity: "Negócios", implemented: true },
  { id: "remover_produto_negocio",     label: "Remover Produto do Negócio",      description: "Remove um produto de um negócio/oportunidade",                            category: "acao",    entity: "Negócios", implemented: true },
  { id: "atualizar_total_negocio",     label: "Atualizar Total do Negócio",      description: "Atualiza o valor total de um negócio/oportunidade",                       category: "acao",    entity: "Negócios", implemented: true },

  // ── Conversas ──────────────────────────────────────────────────────────
  { id: "listar_conversas",              label: "Listar Conversas",               description: "Lista conversas com filtros opcionais e paginação",                        category: "leitura", entity: "Conversas", implemented: true },
  { id: "consultar_conversa_por_lead",   label: "Consultar Conversa por Lead",    description: "Recupera a conversa de um lead específico pelo ID",                        category: "leitura", entity: "Conversas", implemented: true },
  // "Enviar Mensagem" saiu daqui: é ferramenta do núcleo, todo agente já tem
  // sempre (buildDynamicTools em agent-sds-qualify). Como caixa de seleção
  // ela não fazia nada -- não existe schema com esse id no backend -- e dava
  // a impressão de que sem marcar o agente não responderia.
  { id: "buscar_ou_criar_conversa_telefone", label: "Buscar ou Criar Conversa por Telefone", description: "Busca uma conversa existente pelo telefone ou cria uma nova",     category: "acao",    entity: "Conversas", implemented: true },
  { id: "listar_mensagens_conversa",     label: "Listar Mensagens da Conversa",   description: "Lista as mensagens de uma conversa",                                       category: "leitura", entity: "Conversas", implemented: true },

  // ── Produtos ───────────────────────────────────────────────────────────
  { id: "listar_produtos",   label: "Listar Produtos",   description: "Lista todos os produtos disponíveis no catálogo com filtros opcionais", category: "leitura", entity: "Produtos", implemented: true },
  { id: "criar_produto",     label: "Criar Produto",     description: "Cria um novo produto no catálogo",                                      category: "acao",    entity: "Produtos", implemented: false },
  { id: "atualizar_produto", label: "Atualizar Produto", description: "Atualiza um produto existente no catálogo",                              category: "acao",    entity: "Produtos", implemented: false },
  { id: "excluir_produto",   label: "Excluir Produto",   description: "Exclui um produto do catálogo",                                          category: "destrutiva", entity: "Produtos", implemented: false },

  // ── Tags ───────────────────────────────────────────────────────────────
  { id: "listar_tags",   label: "Listar Tags",   description: "Lista todas as tags disponíveis",         category: "leitura", entity: "Tags", implemented: true },
  { id: "criar_tag",     label: "Criar Tag",     description: "Cria uma nova tag",                       category: "acao",    entity: "Tags", implemented: false },
  { id: "atualizar_tag", label: "Atualizar Tag", description: "Atualiza uma tag existente",              category: "acao",    entity: "Tags", implemented: false },
  { id: "excluir_tag",   label: "Excluir Tag",   description: "Exclui uma tag",                          category: "destrutiva", entity: "Tags", implemented: false },

  // ── Listas ─────────────────────────────────────────────────────────────
  { id: "listar_listas",   label: "Listar Listas",   description: "Lista todas as listas disponíveis",     category: "leitura", entity: "Listas", implemented: true },
  { id: "criar_lista",     label: "Criar Lista",     description: "Cria uma nova lista",                   category: "acao",    entity: "Listas", implemented: false },
  { id: "atualizar_lista", label: "Atualizar Lista", description: "Atualiza uma lista existente",          category: "acao",    entity: "Listas", implemented: false },
  { id: "excluir_lista",   label: "Excluir Lista",   description: "Exclui uma lista",                      category: "destrutiva", entity: "Listas", implemented: false },

  // ── Campos Adicionais ──────────────────────────────────────────────────
  { id: "listar_campos_adicionais",   label: "Listar Campos Adicionais",   description: "Lista todos os campos adicionais disponíveis (lead/negócio)", category: "leitura", entity: "Campos Adicionais", implemented: true },
  { id: "criar_campo_adicional",      label: "Criar Campo Adicional",      description: "Cria um novo campo adicional",                                category: "acao",    entity: "Campos Adicionais", implemented: false },
  { id: "atualizar_campo_adicional",  label: "Atualizar Campo Adicional",  description: "Atualiza um campo adicional existente",                       category: "acao",    entity: "Campos Adicionais", implemented: false },
  { id: "excluir_campo_adicional",    label: "Excluir Campo Adicional",    description: "Exclui um campo adicional",                                   category: "destrutiva", entity: "Campos Adicionais", implemented: false },

  // ── Pipelines ──────────────────────────────────────────────────────────
  { id: "listar_pipelines",        label: "Listar Pipelines",         description: "Lista todos os pipelines disponíveis",       category: "leitura", entity: "Pipelines", implemented: true },
  { id: "listar_grupos_pipeline",  label: "Listar Grupos da Pipeline", description: "Lista todos os grupos da pipeline disponíveis", category: "leitura", entity: "Pipelines", implemented: true },
  { id: "listar_etapas_pipeline",  label: "Listar Etapas da Pipeline", description: "Lista todas as etapas de uma pipeline",       category: "leitura", entity: "Pipelines", implemented: true },
  { id: "criar_pipeline",          label: "Criar Pipeline",           description: "Cria um novo pipeline",                       category: "acao",    entity: "Pipelines", implemented: false },
  { id: "atualizar_pipeline",      label: "Atualizar Pipeline",       description: "Atualiza um pipeline existente",              category: "acao",    entity: "Pipelines", implemented: false },
  { id: "salvar_etapas_pipeline",  label: "Salvar Etapas da Pipeline", description: "Salva a configuração das etapas de um pipeline", category: "acao", entity: "Pipelines", implemented: false },
  { id: "excluir_pipeline",        label: "Excluir Pipeline",         description: "Exclui um pipeline",                          category: "destrutiva", entity: "Pipelines", implemented: false },

  // ── Atendentes ─────────────────────────────────────────────────────────
  { id: "listar_atendentes",   label: "Listar Atendentes",   description: "Lista todos os atendentes disponíveis",       category: "leitura", entity: "Atendentes", implemented: true },

  // ── Motivos de Perda ───────────────────────────────────────────────────
  { id: "listar_motivos_perda",   label: "Listar Motivos de Perda",   description: "Lista todos os motivos de perda disponíveis", category: "leitura", entity: "Motivos de Perda", implemented: true },
  { id: "criar_motivo_perda",     label: "Criar Motivo de Perda",     description: "Cria um novo motivo de perda",                category: "acao",    entity: "Motivos de Perda", implemented: false },
  { id: "atualizar_motivo_perda", label: "Atualizar Motivo de Perda", description: "Atualiza um motivo de perda existente",       category: "acao",    entity: "Motivos de Perda", implemented: false },
  { id: "excluir_motivo_perda",   label: "Excluir Motivo de Perda",   description: "Exclui um motivo de perda",                   category: "destrutiva", entity: "Motivos de Perda", implemented: false },

  // ── Horários de Trabalho ───────────────────────────────────────────────
  { id: "listar_horarios_trabalho",   label: "Listar Horários de Trabalho",   description: "Lista todos os horários de trabalho disponíveis",    category: "leitura", entity: "Horários de Trabalho", implemented: true },

  // ── Departamentos ──────────────────────────────────────────────────────
  { id: "listar_departamentos",   label: "Listar Departamentos",   description: "Lista todos os departamentos disponíveis",   category: "leitura", entity: "Departamentos", implemented: true },
  { id: "criar_departamento",     label: "Criar Departamento",     description: "Cria um novo departamento",                  category: "acao",    entity: "Departamentos", implemented: false },
  { id: "atualizar_departamento", label: "Atualizar Departamento", description: "Atualiza um departamento existente",          category: "acao",    entity: "Departamentos", implemented: false },
  { id: "excluir_departamento",   label: "Excluir Departamento",   description: "Exclui um departamento",                     category: "destrutiva", entity: "Departamentos", implemented: false },

  // ── Conexões ───────────────────────────────────────────────────────────
  { id: "listar_conexoes",   label: "Listar Conexões",   description: "Lista todas as conexões disponíveis",      category: "leitura", entity: "Conexões", implemented: true },
];

export const AGENT_TOOL_ENTITIES = [
  "Leads", "Negócios", "Conversas", "Produtos", "Tags", "Listas",
  "Campos Adicionais", "Pipelines", "Atendentes", "Motivos de Perda",
  "Horários de Trabalho", "Departamentos", "Conexões",
] as const;

// ─── Recomendação por objetivo ──────────────────────────────────────────────
//
// Nada aqui é necessário pro agente funcionar: qualificar, agendar e
// responder já vêm das ferramentas do núcleo, ligadas pelo objetivo no
// próprio backend. Esta lista é curta de propósito.
//
// Cada ferramenta marcada entra no prompt de TODA mensagem, com nome,
// descrição e schema. Marcar dezenas custa token por mensagem, por lead, pra
// sempre, e aumenta a chance do modelo chamar a ferramenta errada em vez de
// simplesmente responder. Por isso a recomendação é o mínimo que poupa
// trabalho humano de verdade, não tudo que é tecnicamente possível.
//
// Fora da lista por decisão, não por esquecimento:
//   - atualizar_lead_notas: escreve no card, mas ninguém pediu que o agente
//     anote sozinho. Fica como escolha explícita.
//   - adicionar/remover_tag_lead: o agente pode remover a própria tag de
//     ativação e se desligar da conversa.
//   - atualizar_atendente_lead: troca o dono do lead sem o vendedor saber.
//   - ganhar/perder_negocio: fecha venda no CRM a partir de uma conversa.
export const FERRAMENTAS_RECOMENDADAS: Record<string, string[]> = {
  // Move o card pra etapa certa sozinho. É a operação que mais economiza
  // trabalho manual, e erra barato: com o nome errado, a ferramenta devolve
  // as etapas válidas do funil e o modelo corrige na hora.
  qualificar: ["mover_negocio_estagio"],
  agendar: ["mover_negocio_estagio"],
  // Leitura pura, sem risco: responde preço e catálogo sem depender de a
  // empresa ter alimentado a Base de Conhecimento.
  atendimento: ["listar_produtos"],
};

export function ferramentasRecomendadas(objectives: string[]): string[] {
  const ids = objectives.flatMap((o) => FERRAMENTAS_RECOMENDADAS[o] ?? []);
  return [...new Set(ids)];
}
