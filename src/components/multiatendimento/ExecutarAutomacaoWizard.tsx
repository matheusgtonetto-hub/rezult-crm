import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchLeadManualAutomations, type AutomationOption } from "@/data/disparos";
import { Search, Check, Play, AlertTriangle, Phone } from "lucide-react";

/** Mesmo formato da lista de /leads, para o ticket ler igual nos dois lugares. */
const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
import { useSelecaoPorFiltro } from "@/components/disparos/useSelecaoPorFiltro";

/**
 * "Executar automação" do Multiatendimento, no mesmo formato do Criar disparo.
 *
 * Antes era um popup curto que listava as automações e disparava no primeiro
 * clique -- sem dizer em quem ia executar e sem chance de conferir antes. Com
 * conversa errada selecionada, a mensagem saía para o cliente errado e não
 * havia como voltar atrás.
 *
 * O wizard herda o formato da tela de disparos de propósito: é a mesma tarefa
 * (escolher automação, escolher em quem roda), e duas telas com o mesmo
 * propósito e desenhos diferentes obrigam o atendente a aprender duas vezes.
 *
 * A diferença é que aqui o passo 2 já vem resolvido -- as conversas foram
 * escolhidas na tela -- então ele deixa de ser um filtro e vira uma
 * conferência, que é o único momento em que dá para perceber que a automação
 * ia para a pessoa errada.
 */

export interface ConversaAlvo {
  id: string;
  nome: string;
  telefone?: string;
  /** Sem negócio vinculado a automação não roda: ela age sobre o negócio. */
  temNegocio: boolean;
  /**
   * Campos das colunas extras da lista, todos opcionais.
   *
   * Opcionais porque o wizard atende dois pontos de partida: a lista de leads
   * tem ticket, e-mail e tags à mão; o Multiatendimento parte de conversas, que
   * não têm nada disso. Ausentes, as colunas somem em vez de ficarem com um
   * traço em cada linha -- coluna vazia inteira é ruído, não informação.
   */
  ticketMedio?: number;
  email?: string;
  tags?: { nome: string; cor?: string }[];
}

/**
 * Como chamar o alvo na tela.
 *
 * O mesmo wizard atende dois pontos de partida: o Multiatendimento age sobre
 * conversas, a lista de leads age sobre leads. Chamar tudo de "destinatário"
 * para servir aos dois deixaria os dois textos igualmente estranhos.
 */
export interface TermoDoAlvo { singular: string; plural: string }
const TERMO_PADRAO: TermoDoAlvo = { singular: "conversa", plural: "conversas" };

type Passo = 1 | 2;
/** Quantos alvos a lista desenha de uma vez. Acima disso, a busca é o caminho:
 *  ninguém encontra alguém rolando 2 mil linhas. */
const LIMITE_VISIVEL = 60;

/**
 * Teto da execução manual.
 *
 * Existe porque `onExecutar` roda um `await` por alvo, em fila: mil alvos são
 * mil idas ao servidor uma depois da outra, com o diálogo aberto o tempo todo.
 * Fechar a aba no meio deixa parte executada e parte não, sem registro de onde
 * parou -- e é justamente isso que o disparo resolve, com fila própria e
 * acompanhamento.
 *
 * O número está no texto do trilho da esquerda. Sem a trava aqui, aquele texto
 * seria só uma promessa: nada impedia marcar cinco mil e mandar executar.
 */
const LIMITE_EXECUCAO = 1000;

export function ExecutarAutomacaoWizard({
  open, onOpenChange, conversas, executando, onExecutar, termo = TERMO_PADRAO, opcoes, acaoFiltro, filtroVazio = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /**
   * Alvos escolhidos fora do wizard.
   *
   * Sem `opcoes`, são o passo 2 inteiro: a lista vira conferência do que veio.
   * Com `opcoes`, servem só ao aviso de quem fica de fora por não ter negócio --
   * a restrição do universo aos pré-escolhidos é feita por quem chama, ao montar
   * `opcoes`, para o filtro poder atuar dentro dela.
   */
  conversas: ConversaAlvo[];
  executando: boolean;
  onExecutar: (automationId: string, ids: string[]) => void;
  /** Como nomear o alvo. Padrão "conversa", que é a origem mais frequente. */
  termo?: TermoDoAlvo;
  /**
   * Universo selecionável no passo 2.
   *
   * Quando presente, o passo 2 deixa de ser conferência e vira escolha -- é o
   * que permite abrir "Executar automação" sem ter marcado nada antes. Ausente
   * (o caso do Multiatendimento), o passo 2 segue só confirmando o que veio.
   */
  opcoes?: ConversaAlvo[];
  /**
   * Controle de filtro desenhado ao lado da busca do passo 2.
   *
   * Nó pronto, e não um filtro que o wizard aplique: aqui o alvo é enxuto (id,
   * nome, telefone) e não carrega tag, origem nem valor. Quem sabe filtrar é a
   * tela de origem, que tem os leads inteiros; ela estreita `opcoes` e passa o
   * botão por aqui. Ausente, o passo 2 fica só com a busca, como antes.
   */
  acaoFiltro?: React.ReactNode;
  /**
   * true quando o filtro de `acaoFiltro` está sem nenhum critério.
   *
   * Quem decide é quem filtra, porque só ele conhece a forma do filtro. É o que
   * governa a seleção inicial do passo 2: sem critério nada vem marcado, com
   * critério vem tudo que ele trouxe.
   */
  filtroVazio?: boolean;
}) {
  const { company } = useCompany();
  const [passo, setPasso] = useState<Passo>(1);
  const [automacoes, setAutomacoes] = useState<AutomationOption[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaAlvo, setBuscaAlvo] = useState("");
  const [automacaoId, setAutomacaoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const podeEscolher = !!opcoes;
  const PASSOS: { n: Passo; label: string }[] = [
    { n: 1, label: "Selecionar automação" },
    // O passo 2 muda de nome com o que ele faz: onde dá para escolher, é
    // seleção; onde os alvos já vieram decididos, é conferência. Um rótulo só
    // para os dois mentiria em um dos casos.
    { n: 2, label: podeEscolher ? `Selecionar ${termo.plural}` : "Confirmar destinatários" },
  ];

  useEffect(() => {
    if (!open) return;
    setPasso(1); setAutomacaoId(null); setBusca(""); setBuscaAlvo("");
    if (!company) return;
    setCarregando(true);
    fetchLeadManualAutomations(company.id)
      .then(setAutomacoes)
      .catch(() => setAutomacoes([]))
      .finally(() => setCarregando(false));
    // Depende do id da empresa, não do objeto: `company` troca de identidade a
    // cada recarga do contexto e refaria a busca sem nada ter mudado. Mesmo
    // padrão do CreateDisparoWizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company?.id]);

  // Só automações ativas. Uma inativa aparece na tela de disparos porque lá o
  // disparo pode ser agendado para depois; aqui a execução é agora, e oferecer
  // o que não vai rodar é convidar o atendente a clicar e não entender nada.
  const listadas = useMemo(
    () => automacoes.filter(a => a.active && a.name.toLowerCase().includes(busca.trim().toLowerCase())),
    [automacoes, busca],
  );
  const escolhida = automacoes.find(a => a.id === automacaoId);
  const comNegocio = conversas.filter(c => c.temNegocio);
  const semNegocio = conversas.filter(c => !c.temNegocio);

  // Universo do passo 2, filtrado pela busca. Sem `opcoes`, é o que veio pronto.
  const universo = opcoes ?? comNegocio;
  const filtrados = useMemo(() => {
    const q = buscaAlvo.trim().toLowerCase();
    if (!q) return universo;
    // Os dígitos da busca só entram na comparação se existirem. Sem esta
    // guarda, procurar por um nome ("Thairo") deixa `digitos` vazio, e
    // `includes("")` é verdadeiro para TODO telefone -- a busca parecia
    // ignorada porque toda linha passava pelo segundo critério.
    const digitos = q.replace(/\D/g, "");
    return universo.filter(c =>
      c.nome.toLowerCase().includes(q)
      || (digitos !== "" && (c.telefone ?? "").replace(/\D/g, "").includes(digitos)));
  }, [universo, buscaAlvo]);

  /**
   * Seleção do passo 2, no mesmo hook do Criar disparo.
   *
   * Opera sobre `filtrados`, e não sobre o universo inteiro: a busca é critério
   * igual ao filtro, e a contagem logo acima da lista mostra isso. Executar em
   * quem a busca escondeu seria agir fora da tela.
   *
   * A busca conta como critério para o "vazio", senão digitar um nome deixaria
   * a lista com uma linha só e nenhuma marcada, o que ninguém entenderia.
   */
  const semCriterio = filtroVazio && buscaAlvo.trim() === "";
  const { selecionados, marcado, alternar, todosMarcados, alternarTodos } =
    useSelecaoPorFiltro(filtrados, semCriterio, open);
  /**
   * Quem a automação vai atingir.
   *
   * Com escolha, os selecionados -- que já saem do critério atual (filtro e
   * busca), então ninguém invisível entra na execução. Sem escolha, valem os que
   * vieram de fora e não há critério que os altere.
   */
  const idsFinais = podeEscolher ? selecionados.map(c => c.id) : comNegocio.map(c => c.id);

  const excedeuLimite = idsFinais.length > LIMITE_EXECUCAO;

  // As colunas extras existem se ALGUÉM no universo trouxe o dado. Decidido uma
  // vez para a lista toda, e não por linha: por linha, a coluna apareceria e
  // sumiria conforme os dados, e nada alinharia entre as linhas.
  const temColunaContato = universo.some(c => c.telefone || c.email);
  const temColunaTags = universo.some(c => c.tags?.length);

  return (
    <Dialog open={open} onOpenChange={o => { if (!executando) onOpenChange(o); }}>
      {/* 1040px, e não os 768 de antes.
          O `max-w-3xl` que estava aqui vencia o `width` inline (768 contra os
          820 pedidos), e o que sobrava para a lista eram 478px: o trilho leva
          240, o padding leva 48. Com as colunas fixas de Contato e Tags somando
          380px com as folgas, o nome ficava com 98px e o resto era cortado pelo
          `overflow-hidden` do diálogo.
          Medido no navegador, não estimado. */}
      <DialogContent className="max-w-[1040px] p-0 gap-0 overflow-hidden" style={{ width: "min(1040px, 94vw)" }}>
        {/* O título do diálogo existe para o leitor de tela: o Radix avisa no
            console quando falta, e sem ele quem navega por áudio abre a janela
            sem saber o que ela é. Fica escondido porque o mesmo texto já
            aparece no trilho da esquerda, em tamanho de cabeçalho. */}
        <DialogTitle className="sr-only">Executar automação</DialogTitle>
        {/* A altura fixa mora AQUI, no contêiner, e não no miolo rolável.
            Lá dentro ela não segurava nada: o miolo é `flex-1` numa coluna
            flex, e o `flex-grow` manda no eixo vertical, ignorando `height`.
            Ele crescia com a lista e o diálogo passava da tela.
            Com o contêiner fixo, os dois passos medem igual e o miolo rola. */}
        <div className="flex" style={{ height: "min(700px, 84vh)" }}>
          {/* Trilho da esquerda */}
          <div className="w-60 shrink-0 border-r border-border p-6 bg-secondary/30">
            <h2 className="text-lg font-bold">Executar automação</h2>
            {/* `termo.plural` no lugar de "leads" fixo: o mesmo wizard atende o
                Multiatendimento, que age sobre conversas. Escrito na mão, o
                texto passaria a prometer leads numa tela que não tem leads. */}
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Configure o início de uma automação para até 1000 (mil) {termo.plural} manualmente
            </p>
            {/* `Link` do router, e não um botão com `navigate`: assim o
                ctrl+clique abre em outra aba, o hover mostra o destino na barra
                de status e o leitor de tela anuncia como link. O diálogo some
                sozinho na navegação, porque quem o renderiza é a página. */}
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Para execuções maiores crie um{" "}
              <Link to="/disparos" className="text-primary font-medium hover:underline underline-offset-2">
                disparo
              </Link>.
            </p>
            <div className="mt-6 space-y-4">
              {PASSOS.map(p => {
                const feito = passo > p.n;
                const ativo = passo === p.n;
                return (
                  <div key={p.n} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{
                        background: feito ? "hsl(var(--primary))" : ativo ? "hsl(var(--primary) / 0.12)" : "transparent",
                        color: feito ? "#fff" : ativo ? "hsl(var(--primary))" : "#94A3B8",
                        border: ativo ? "1.5px solid hsl(var(--primary))" : feito ? "none" : "1.5px solid #CBD5E1",
                      }}
                    >
                      {feito ? <Check size={13} /> : p.n}
                    </div>
                    <span className="text-sm" style={{ color: ativo ? "hsl(var(--foreground))" : "#94A3B8", fontWeight: ativo ? 600 : 400 }}>
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* `min-w-0` não é detalhe: item flex nasce com `min-width: auto` e
                se recusa a encolher abaixo do conteúdo. Com as colunas de
                largura fixa da lista, esta coluna crescia para acomodá-las e
                empurrava o diálogo inteiro para fora da tela -- o botão de
                executar e o filtro da busca saíam de vista. */}
            {/* `min-h-0` é o que faz a rolagem existir: item de coluna flex
                nasce com `min-height: auto` e se recusa a ficar menor que o
                conteúdo, então a lista empurraria o contêiner em vez de rolar
                dentro dele. Mesma armadilha do `min-w-0` na horizontal. */}
            <div className="flex-1 min-w-0 min-h-0 p-6 overflow-y-auto">
              {passo === 1 && (
                <>
                  <h3 className="text-base font-semibold">Selecione a automação</h3>
                  <p className="text-sm text-muted-foreground">Escolha a automação que será executada.</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2 mb-3">
                    <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/50 flex items-center justify-center text-[9px]">i</span>
                    Somente automações ativas com gatilho de execução manual podem ser selecionadas.
                  </p>
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Pesquisar..." className="pl-9 h-9" value={busca} onChange={e => setBusca(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    {carregando && <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>}
                    {!carregando && listadas.length === 0 && (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        Nenhuma automação ativa com gatilho manual.<br />
                        Crie uma automação com o gatilho "Execução manual por lead" e deixe-a ativa.
                      </p>
                    )}
                    {listadas.map(a => (
                      <button key={a.id} type="button" onClick={() => setAutomacaoId(a.id)}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors"
                        style={{ borderColor: automacaoId === a.id ? "hsl(var(--primary))" : "#E5E7EB", background: automacaoId === a.id ? "hsl(var(--primary) / 0.04)" : "#fff" }}>
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: automacaoId === a.id ? "hsl(var(--primary))" : "#CBD5E1" }}>
                          {automacaoId === a.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className="text-sm font-medium">{a.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {passo === 2 && (
                <>
                  <h3 className="text-base font-semibold">
                    {podeEscolher ? `Selecionar ${termo.plural}` : "Confirmar destinatários"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {podeEscolher ? (
                      <>Escolha em quem a automação <strong className="text-foreground">{escolhida?.name}</strong> vai rodar.</>
                    ) : (
                      <>
                        A automação <strong className="text-foreground">{escolhida?.name}</strong> será executada
                        {comNegocio.length === 1 ? ` neste ${termo.singular}` : ` nestes ${comNegocio.length} ${termo.plural}`}.
                      </>
                    )}
                  </p>

                  {podeEscolher && (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative flex-1">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder={`Procurar ${termo.plural} por nome ou telefone`}
                          className="pl-9 h-9"
                          value={buscaAlvo}
                          onChange={e => setBuscaAlvo(e.target.value)}
                        />
                      </div>
                      {/* O botão de filtros vem pronto de quem chama, e o wizard
                          só reserva o lugar. Ele trabalha com um alvo enxuto
                          (id, nome, telefone), sem tag, origem ou valor para
                          filtrar; e no Multiatendimento o alvo nem é lead. Quem
                          sabe filtrar é a tela de origem, que já tem os leads
                          inteiros e a função que decide quem passa. */}
                      {acaoFiltro}
                    </div>
                  )}

                  {/* Quem fica de fora aparece ANTES da lista, e com o motivo.
                      Este era o ponto cego do popup antigo: as conversas sem
                      negócio eram descartadas em silêncio e o atendente só
                      descobria pelo aviso no fim, depois de já ter disparado. */}
                  {semNegocio.length > 0 && (
                    <div className="flex gap-2.5 rounded-lg border p-3 mb-3" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" color="#B45309" />
                      <div className="text-xs leading-relaxed" style={{ color: "#92400E" }}>
                        <strong>{semNegocio.length} {semNegocio.length === 1 ? termo.singular : termo.plural} {semNegocio.length === 1 ? "fica" : "ficam"} de fora</strong> por não terem negócio vinculado:
                        a automação age sobre o negócio do contato.
                        <div className="mt-1 opacity-80">{semNegocio.map(c => c.nome).join(", ")}</div>
                      </div>
                    </div>
                  )}

                  {/* Mesmo formato âmbar do aviso de "sem negócio": os dois
                      dizem "isto não vai acontecer como você espera", e dois
                      desenhos para o mesmo tipo de recado fariam o segundo
                      parecer outra coisa. */}
                  {excedeuLimite && (
                    <div className="flex gap-2.5 rounded-lg border p-3 mb-3" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" color="#B45309" />
                      <div className="text-xs leading-relaxed" style={{ color: "#92400E" }}>
                        <strong>{idsFinais.length.toLocaleString("pt-BR")} {termo.plural} é mais do que a execução manual comporta</strong> (o teto é {LIMITE_EXECUCAO.toLocaleString("pt-BR")}).
                        Ela roda um a um e com esse volume ficaria minutos presa nesta janela.{" "}
                        <Link to="/disparos" className="font-semibold underline underline-offset-2">
                          Crie um disparo
                        </Link>{" "}
                        ou reduza a seleção pelos filtros.
                      </div>
                    </div>
                  )}

                  {podeEscolher && (
                    // Colados, e não nas duas pontas. O "Marcar todos" age
                    // sobre a contagem ao lado, e mandá-lo para a outra ponta
                    // fazia o olho atravessar o painel para ligar uma coisa à
                    // outra. `gap-3` para o texto não virar parte do link.
                    <div className="flex items-center gap-3 mb-2">
                      <p className="text-[13px] font-semibold text-primary">
                        {selecionados.length.toLocaleString("pt-BR")} de {filtrados.length.toLocaleString("pt-BR")} {termo.plural} {selecionados.length === 1 ? "selecionado" : "selecionados"}
                      </p>
                      {filtrados.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                          onClick={alternarTodos}
                        >
                          {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Cabeçalho só quando há mais de uma coluna: com o nome
                      sozinho, um rótulo "NOME" acima explicaria o óbvio. */}
                  {(temColunaContato || temColunaTags) && (
                    <div className="flex items-center gap-3 px-3.5 pb-2 mb-1 border-b border-border text-xs text-muted-foreground">
                      {podeEscolher && <span className="w-4 shrink-0" />}
                      <span className="w-7 shrink-0" />
                      <span className="flex-1 min-w-0">Nome</span>
                      {temColunaContato && <span className="flex-1 min-w-0 hidden sm:block">Contato</span>}
                      {temColunaTags && <span className="flex-1 min-w-0 hidden md:block">Tags</span>}
                    </div>
                  )}

                  {/* Sem moldura e sem risco entre as linhas. A régua sob o
                      cabeçalho já separa o rótulo dos dados, e uma linha a cada
                      registro fazia a lista competir com a tabela de /leads
                      atrás do diálogo. O realce no hover e a caixa de marcação
                      dão o limite de cada linha sem desenhar nada. */}
                  <div>
                    {filtrados.slice(0, LIMITE_VISIVEL).map(c => {
                      const marcadoAqui = podeEscolher ? marcado(c.id) : true;
                      // Sem escolha possível, a linha é registro e não controle:
                      // vira <div>. Com escolha, é botão de verdade -- inclusive
                      // para o teclado, que num <div> clicável não alcança.
                      const Elemento = podeEscolher ? "button" : "div";
                      return (
                        <Elemento
                          key={c.id}
                          {...(podeEscolher ? { type: "button" as const, onClick: () => alternar(c.id) } : {})}
                          className={`flex items-center gap-3 px-3.5 py-2.5 w-full text-left ${podeEscolher ? "hover:bg-secondary/40 transition-colors" : ""}`}
                        >
                          {podeEscolher && (
                            <div className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
                                 style={{ borderColor: marcadoAqui ? "hsl(var(--primary))" : "#CBD5E1", background: marcadoAqui ? "hsl(var(--primary))" : "transparent" }}>
                              {marcadoAqui && <Check size={11} color="#fff" />}
                            </div>
                          )}
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: "#128A68" }}>
                            {c.nome.trim().charAt(0).toUpperCase() || "?"}
                          </div>

                          {/* NOME: nome e, abaixo, o ticket médio na mesma
                              pastilha da lista de /leads. É a coluna que mais
                              cresce, então leva o `flex-1`. */}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate leading-none">{c.nome}</div>
                            {c.ticketMedio !== undefined && (
                              <span style={{ fontSize: 8, fontWeight: 600 }} className="inline-flex items-center rounded-full bg-gray-100 px-1 py-0.5 text-gray-500">
                                Ticket médio <span className="text-green-600 ml-1">{fmtBRL(c.ticketMedio)}</span>
                              </span>
                            )}
                          </div>

                          {/* CONTATO e TAGS dividem a largura em partes iguais
                              com o NOME: `flex-1` nas três dá `flex-basis: 0`, e
                              aí o espaço é repartido igualmente em vez de seguir
                              o conteúdo. Assim as colunas caem no mesmo x em
                              todas as linhas e acompanham o diálogo quando ele
                              encolhe, sem número fixo para recalcular. */}
                          {temColunaContato && (
                            <div className="flex-1 min-w-0 hidden sm:block">
                              <div className="flex items-center gap-1.5 text-xs text-foreground">
                                <Phone size={12} className="shrink-0 text-muted-foreground" />
                                <span className="truncate">{c.telefone || "—"}</span>
                              </div>
                              {c.email && <div className="text-[11px] text-muted-foreground truncate pl-[18px]">{c.email}</div>}
                            </div>
                          )}

                          {/* TAGS: só as duas primeiras, e o resto vira "+N". A
                              linha tem 40px de altura e um lead com seis tags
                              faria a lista inteira crescer para acomodar um
                              caso raro. */}
                          {temColunaTags && (
                            <div className="flex-1 min-w-0 hidden md:flex flex-wrap gap-1 content-center">
                              {(c.tags ?? []).length === 0
                                ? <span className="text-xs text-muted-foreground">—</span>
                                : (
                                  <>
                                    {(c.tags ?? []).slice(0, 2).map(t => (
                                      <span key={t.nome} className="text-[10px] px-2 rounded-full text-white font-medium truncate max-w-[150px]"
                                            style={{ paddingTop: 2, paddingBottom: 2, background: t.cor || "#888" }}>
                                        {t.nome}
                                      </span>
                                    ))}
                                    {(c.tags ?? []).length > 2 && (
                                      <span className="text-[11px] text-muted-foreground">+{(c.tags ?? []).length - 2}</span>
                                    )}
                                  </>
                                )}
                            </div>
                          )}
                        </Elemento>
                      );
                    })}
                    {filtrados.length > LIMITE_VISIVEL && (
                      <p className="text-xs text-muted-foreground text-center py-2 px-4">
                        + {filtrados.length - LIMITE_VISIVEL} {termo.plural}. Use a busca para chegar em alguém específico.
                      </p>
                    )}
                    {filtrados.length === 0 && (
                      <p className="text-sm text-muted-foreground py-6 text-center px-4">
                        {podeEscolher
                          ? `Nenhum ${termo.singular} encontrado.`
                          : "Nenhum dos selecionados tem negócio vinculado."}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Rodapé */}
            <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2">
              {passo > 1 && (
                <Button variant="outline" disabled={executando} onClick={() => setPasso(1)}>Voltar</Button>
              )}
              {passo === 1 && (
                <Button disabled={!automacaoId} onClick={() => setPasso(2)}>Próximo</Button>
              )}
              {passo === 2 && (
                <Button
                  className="gap-2"
                  disabled={executando || idsFinais.length === 0 || !automacaoId || excedeuLimite}
                  onClick={() => automacaoId && onExecutar(automacaoId, idsFinais)}
                >
                  {executando
                    ? "Executando…"
                    : <><Play size={15} /> Executar em {idsFinais.length} {idsFinais.length === 1 ? termo.singular : termo.plural}</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
