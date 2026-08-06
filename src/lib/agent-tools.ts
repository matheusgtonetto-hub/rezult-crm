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
  { id: "atualizar_lead_notas",      label: "Atualizar Notas do Lead",          description: "Atualiza as notas de um lead existente",                                      category: "acao",    entity: "Leads", implemented: true },
  { id: "definir_campo_adicional_lead", label: "Definir Campo Adicional do Lead", description: "Define o valor de um campo adicional de um lead",                          category: "acao",    entity: "Leads", implemented: true },
  { id: "atualizar_atendente_lead",  label: "Atualizar Atendente do Lead",      description: "Atualiza o atendente responsável de um lead existente",                      category: "acao",    entity: "Leads", implemented: true },
  { id: "listar_negocios_do_lead",   label: "Listar Negócios do Lead",          description: "Lista todos os negócios/oportunidades de um lead específico",                category: "leitura", entity: "Leads", implemented: true },
  { id: "excluir_lead",              label: "Excluir Lead",                     description: "Exclui um lead do CRM",                                                       category: "destrutiva", entity: "Leads", implemented: false },
  { id: "adicionar_tag_lead",        label: "Adicionar Tag ao Lead",            description: "Adiciona uma tag a um lead existente",                                        category: "acao",    entity: "Leads", implemented: true },
  { id: "remover_tag_lead",          label: "Remover Tag do Lead",              description: "Remove uma tag de um lead existente",                                         category: "acao",    entity: "Leads", implemented: true },
  { id: "adicionar_lead_lista",      label: "Adicionar Lead à Lista",           description: "Adiciona um lead a uma lista existente",                                      category: "acao",    entity: "Leads", implemented: false },
  { id: "remover_lead_lista",        label: "Remover Lead da Lista",            description: "Remove um lead de uma lista existente",                                       category: "acao",    entity: "Leads", implemented: false },

  // ── Negócios ───────────────────────────────────────────────────────────
  { id: "criar_negocio",               label: "Criar Negócio",                   description: "Cria um novo negócio/oportunidade no pipeline do CRM",                    category: "acao",    entity: "Negócios", implemented: true },
  { id: "listar_negocios_por_estagio", label: "Listar Negócios por Estágio",     description: "Lista negócios/oportunidades de um estágio específico do pipeline",       category: "leitura", entity: "Negócios", implemented: true },
  { id: "listar_negocios_por_atendente", label: "Listar Negócios por Atendente", description: "Lista negócios/oportunidades atribuídos a um atendente específico",       category: "leitura", entity: "Negócios", implemented: true },
  { id: "mover_negocio_estagio",       label: "Mover Negócio de Estágio",        description: "Move um negócio/oportunidade para outro estágio do pipeline",             category: "acao",    entity: "Negócios", implemented: true },
  { id: "ganhar_negocio",              label: "Ganhar Negócio",                  description: "Marca um negócio/oportunidade como ganho",                                category: "acao",    entity: "Negócios", implemented: true },
  { id: "perder_negocio",              label: "Perder Negócio",                  description: "Marca um negócio/oportunidade como perdido",                              category: "acao",    entity: "Negócios", implemented: true },
  { id: "atualizar_atendente_negocio", label: "Atualizar Atendente do Negócio",  description: "Atualiza o atendente responsável de um negócio existente",               category: "acao",    entity: "Negócios", implemented: true },
  { id: "adicionar_produto_negocio",   label: "Adicionar Produto ao Negócio",    description: "Adiciona um produto a um negócio/oportunidade",                           category: "acao",    entity: "Negócios", implemented: true },
  { id: "remover_produto_negocio",     label: "Remover Produto do Negócio",      description: "Remove um produto de um negócio/oportunidade",                            category: "acao",    entity: "Negócios", implemented: true },
  { id: "atualizar_total_negocio",     label: "Atualizar Total do Negócio",      description: "Atualiza o valor total de um negócio/oportunidade",                       category: "acao",    entity: "Negócios", implemented: true },

  // ── Conversas ──────────────────────────────────────────────────────────
  { id: "listar_conversas",              label: "Listar Conversas",               description: "Lista conversas com filtros opcionais e paginação",                        category: "leitura", entity: "Conversas", implemented: true },
  { id: "consultar_conversa_por_lead",   label: "Consultar Conversa por Lead",    description: "Recupera a conversa de um lead específico pelo ID",                        category: "leitura", entity: "Conversas", implemented: true },
  { id: "enviar_mensagem",               label: "Enviar Mensagem",                description: "Envia uma mensagem em uma conversa",                                       category: "acao",    entity: "Conversas", implemented: true },
  { id: "buscar_ou_criar_conversa_telefone", label: "Buscar ou Criar Conversa por Telefone", description: "Busca uma conversa existente pelo telefone ou cria uma nova",     category: "acao",    entity: "Conversas", implemented: true },
  { id: "listar_mensagens_conversa",     label: "Listar Mensagens da Conversa",   description: "Lista as mensagens de uma conversa",                                       category: "leitura", entity: "Conversas", implemented: true },

  // ── Produtos ───────────────────────────────────────────────────────────
  { id: "listar_produtos",   label: "Listar Produtos",   description: "Lista todos os produtos disponíveis no catálogo com filtros opcionais", category: "leitura", entity: "Produtos", implemented: true },
  { id: "consultar_produto", label: "Consultar Produto", description: "Recupera um produto específico pelo ID",                                category: "leitura", entity: "Produtos", implemented: true },
  { id: "criar_produto",     label: "Criar Produto",     description: "Cria um novo produto no catálogo",                                      category: "acao",    entity: "Produtos", implemented: false },
  { id: "atualizar_produto", label: "Atualizar Produto", description: "Atualiza um produto existente no catálogo",                              category: "acao",    entity: "Produtos", implemented: false },
  { id: "excluir_produto",   label: "Excluir Produto",   description: "Exclui um produto do catálogo",                                          category: "destrutiva", entity: "Produtos", implemented: false },

  // ── Tags ───────────────────────────────────────────────────────────────
  { id: "listar_tags",   label: "Listar Tags",   description: "Lista todas as tags disponíveis",         category: "leitura", entity: "Tags", implemented: true },
  { id: "consultar_tag", label: "Consultar Tag", description: "Recupera uma tag específica pelo ID",     category: "leitura", entity: "Tags", implemented: true },
  { id: "criar_tag",     label: "Criar Tag",     description: "Cria uma nova tag",                       category: "acao",    entity: "Tags", implemented: false },
  { id: "atualizar_tag", label: "Atualizar Tag", description: "Atualiza uma tag existente",              category: "acao",    entity: "Tags", implemented: false },
  { id: "excluir_tag",   label: "Excluir Tag",   description: "Exclui uma tag",                          category: "destrutiva", entity: "Tags", implemented: false },

  // ── Listas ─────────────────────────────────────────────────────────────
  { id: "listar_listas",   label: "Listar Listas",   description: "Lista todas as listas disponíveis",     category: "leitura", entity: "Listas", implemented: true },
  { id: "consultar_lista", label: "Consultar Lista", description: "Recupera uma lista específica pelo ID", category: "leitura", entity: "Listas", implemented: true },
  { id: "criar_lista",     label: "Criar Lista",     description: "Cria uma nova lista",                   category: "acao",    entity: "Listas", implemented: false },
  { id: "atualizar_lista", label: "Atualizar Lista", description: "Atualiza uma lista existente",          category: "acao",    entity: "Listas", implemented: false },
  { id: "excluir_lista",   label: "Excluir Lista",   description: "Exclui uma lista",                      category: "destrutiva", entity: "Listas", implemented: false },

  // ── Campos Adicionais ──────────────────────────────────────────────────
  { id: "listar_campos_adicionais",   label: "Listar Campos Adicionais",   description: "Lista todos os campos adicionais disponíveis (lead/negócio)", category: "leitura", entity: "Campos Adicionais", implemented: true },
  { id: "consultar_campo_adicional",  label: "Consultar Campo Adicional",  description: "Recupera um campo adicional específico pelo ID",              category: "leitura", entity: "Campos Adicionais", implemented: true },
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
  { id: "consultar_atendente", label: "Consultar Atendente", description: "Recupera um atendente específico pelo ID",    category: "leitura", entity: "Atendentes", implemented: true },

  // ── Motivos de Perda ───────────────────────────────────────────────────
  { id: "listar_motivos_perda",   label: "Listar Motivos de Perda",   description: "Lista todos os motivos de perda disponíveis", category: "leitura", entity: "Motivos de Perda", implemented: true },
  { id: "consultar_motivo_perda", label: "Consultar Motivo de Perda", description: "Recupera um motivo de perda específico pelo ID", category: "leitura", entity: "Motivos de Perda", implemented: true },
  { id: "criar_motivo_perda",     label: "Criar Motivo de Perda",     description: "Cria um novo motivo de perda",                category: "acao",    entity: "Motivos de Perda", implemented: false },
  { id: "atualizar_motivo_perda", label: "Atualizar Motivo de Perda", description: "Atualiza um motivo de perda existente",       category: "acao",    entity: "Motivos de Perda", implemented: false },
  { id: "excluir_motivo_perda",   label: "Excluir Motivo de Perda",   description: "Exclui um motivo de perda",                   category: "destrutiva", entity: "Motivos de Perda", implemented: false },

  // ── Horários de Trabalho ───────────────────────────────────────────────
  { id: "listar_horarios_trabalho",   label: "Listar Horários de Trabalho",   description: "Lista todos os horários de trabalho disponíveis",    category: "leitura", entity: "Horários de Trabalho", implemented: true },
  { id: "consultar_horario_trabalho", label: "Consultar Horário de Trabalho", description: "Recupera um horário de trabalho específico pelo ID", category: "leitura", entity: "Horários de Trabalho", implemented: true },

  // ── Departamentos ──────────────────────────────────────────────────────
  { id: "listar_departamentos",   label: "Listar Departamentos",   description: "Lista todos os departamentos disponíveis",   category: "leitura", entity: "Departamentos", implemented: true },
  { id: "consultar_departamento", label: "Consultar Departamento", description: "Recupera um departamento específico pelo ID", category: "leitura", entity: "Departamentos", implemented: true },
  { id: "criar_departamento",     label: "Criar Departamento",     description: "Cria um novo departamento",                  category: "acao",    entity: "Departamentos", implemented: false },
  { id: "atualizar_departamento", label: "Atualizar Departamento", description: "Atualiza um departamento existente",          category: "acao",    entity: "Departamentos", implemented: false },
  { id: "excluir_departamento",   label: "Excluir Departamento",   description: "Exclui um departamento",                     category: "destrutiva", entity: "Departamentos", implemented: false },

  // ── Conexões ───────────────────────────────────────────────────────────
  { id: "listar_conexoes",   label: "Listar Conexões",   description: "Lista todas as conexões disponíveis",      category: "leitura", entity: "Conexões", implemented: true },
  { id: "consultar_conexao", label: "Consultar Conexão", description: "Recupera uma conexão específica pelo ID",  category: "leitura", entity: "Conexões", implemented: true },
];

export const AGENT_TOOL_ENTITIES = [
  "Leads", "Negócios", "Conversas", "Produtos", "Tags", "Listas",
  "Campos Adicionais", "Pipelines", "Atendentes", "Motivos de Perda",
  "Horários de Trabalho", "Departamentos", "Conexões",
] as const;
