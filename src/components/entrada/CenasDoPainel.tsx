import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  Bot, BotMessageSquare, Check, Clock, Filter, House, MessageCircle, Network, Play, Send, UsersRound,
} from "lucide-react";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";

/**
 * As quatro cenas do painel de destaques: cada uma é uma "tela" do produto que
 * se monta sozinha, uma vez, e fica parada no estado final.
 *
 * ─── Por que desenhadas, e não um print ─────────────────────────────────────
 *
 * Um print não se mexe, e o pedido era mostrar o produto em movimento. Também
 * não segue o idioma, o tema nem o tamanho do painel. Aqui a cena é HTML do
 * mesmo tipo do `FundoDoCrm` (réplica do board, com gente fictícia): a
 * estrutura é a do produto, as pessoas não são de ninguém.
 *
 * ─── O texto DENTRO das cenas não passa pelo dicionário ─────────────────────
 *
 * "Pipeline Comercial", "Reunião Marcada", as mensagens do chat: é o que o app
 * mostra, e o app é em português nos três idiomas da tela de entrada. A cena é
 * um print em movimento, e um print de uma interface em português não se
 * traduz. O que é texto de VENDA (tag, título, descrição) mora no dicionário.
 * A cena toda é `aria-hidden`: quem lê por voz recebe o título e a descrição,
 * que dizem a mesma coisa sem as peças soltas.
 *
 * ─── Como a coreografia funciona ────────────────────────────────────────────
 *
 * Cada elemento que entra leva `--pj-atraso` (quando começa) e uma classe de
 * `painel-de-funcionalidades.css`. O estado natural é o FINAL, então sem
 * animação (movimento reduzido) a cena aparece completa. Os tempos em
 * milissegundos estão aqui, ao lado do elemento a que se referem, porque é
 * assim que se lê "o que acontece primeiro".
 */

/* ── Cores do próprio produto ─────────────────────────────────────────────────
   Copiadas de onde o produto as define: as etapas de exemplo, de `FundoDoCrm`;
   os blocos, de `NODE_META` em `AutomacoesPage`; a marca, do `--accent-400`.
   Hex fixo, e não token, pela regra da superfície de venda: a janela é um print
   e não segue o tema. */
const ETAPA = { qualificado: "#F97316", reuniao: "#E24B4A", proposta: "#8B5CF6" } as const;
const BLOCO = { inicio: "#16A34A", mensagem: "#0EA5E9", espera: "#3B82F6", ia: "#8B5CF6" } as const;
const ETIQUETA = { meta: "#3B82F6", demo: "#128C69", cal: "#1D1D1D" } as const;
const PESSOA = { cinza: "#7C8B99", laranja: "#F97316", azul: "#3B82F6", roxo: "#8B5CF6", marca: "#128C69", ceu: "#0EA5E9" } as const;

/* Variáveis CSS que o estilo da cena lê. Cast, porque `CSSProperties` não
   conhece propriedade personalizada. */
const comAtraso = (ms: number) => ({ "--pj-atraso": `${ms}ms` }) as CSSProperties;
const comCor = (hex: string) => ({ "--cor": hex }) as CSSProperties;
const comAtrasoECor = (ms: number, hex: string) =>
  ({ "--pj-atraso": `${ms}ms`, "--cor": hex }) as CSSProperties;

const iniciais = (nome: string) =>
  nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();

/* ── Moldura: barra lateral + conteúdo ────────────────────────────────────── */

/** Os ícones da barra, na ordem da navegação real (ver `AppSidebar`). */
const TRILHO = [
  { id: "inicio", Icone: House },
  { id: "funil", Icone: Filter },
  { id: "contatos", Icone: UsersRound },
  { id: "atendimento", Icone: CrmWhatsAppIcon },
  { id: "automacoes", Icone: Network },
  { id: "agentes", Icone: BotMessageSquare },
] as const;

type ItemDoTrilho = (typeof TRILHO)[number]["id"];

function Janela({ ativo, duplo, children }: { ativo: ItemDoTrilho; duplo?: boolean; children: ReactNode }) {
  return (
    <div className="pj-janela" aria-hidden="true">
      <div className="pj-trilho">
        <img className="pj-marca" src="/favicon.png?v=5" alt="" />
        {TRILHO.map(({ id, Icone }) => (
          <span key={id} className="pj-item" data-ativo={id === ativo}>
            <Icone size="1.05em" strokeWidth={id === ativo ? 2 : 1.75} />
          </span>
        ))}
      </div>
      <div className={`pj-conteudo${duplo ? " pj-conteudo--duplo" : ""}`}>{children}</div>
    </div>
  );
}

/** Um valor que muda no mesmo lugar: o antigo some e o novo aparece. */
function Troca({ antes, depois, atrasoMs }: { antes: string; depois: string; atrasoMs: number }) {
  return (
    <span className="pj-troca" style={comAtraso(atrasoMs)}>
      <span className="pj-troca-antigo">{antes}</span>
      <span className="pj-troca-novo">{depois}</span>
    </span>
  );
}

/* ═══ Cena 1: funil de vendas ═════════════════════════════════════════════════
   Uma etapa abre o quadro, um negócio é levantado e atravessa para a etapa
   seguinte, e o aviso confirma. Linha do tempo (ms):

        250-410   as três colunas sobem
        300       o negócio aparece na coluna de origem
       1400       o contorno da vaga surge na coluna de destino
       1476       o negócio é levantado (borda verde e sombra)
       1700-2540  atravessa
       2500       os contadores trocam (3 para 2, 2 para 3)
       3100       pousa, e o aviso aparece */

interface CardDoFunil {
  nome: string;
  cor: string;
  etiqueta: { texto: string; cor: string };
  viaja?: boolean;
}

function Card({ nome, cor, etiqueta, viaja }: CardDoFunil) {
  return (
    <div className={`pj-card${viaja ? " pj-card--viaja" : ""}`}>
      <div className="pj-card-linha">
        <span className="pj-avatar" style={comCor(cor)}><span>{iniciais(nome)}</span></span>
        <span className="pj-nome">{nome}</span>
      </div>
      <div className="pj-card-linha">
        <span className="pj-etiqueta" style={comCor(etiqueta.cor)}>{etiqueta.texto}</span>
        <span className="pj-zap" style={{ marginLeft: "auto" }}>
          <CrmWhatsAppIcon size="0.85em" />
        </span>
      </div>
    </div>
  );
}

function Coluna(
  { cor, nome, atrasoMs, contador, children }:
  { cor: string; nome: string; atrasoMs: number; contador: ReactNode; children: ReactNode },
) {
  return (
    <div className="pj-coluna pj-sobe" style={comAtraso(atrasoMs)}>
      <div className="pj-coluna-topo">
        <span className="pj-bolinha" style={comCor(cor)} />
        <span className="pj-coluna-nome">{nome}</span>
        <span className="pj-contador">{contador}</span>
      </div>
      {children}
    </div>
  );
}

export function CenaFunil() {
  return (
    <Janela ativo="funil">
      <div className="pj-topo pj-surge" style={comAtraso(100)}>
        <div>
          <div className="pj-titulo">Pipeline Comercial</div>
          <div className="pj-sub">Venda</div>
        </div>
      </div>

      <div className="pj-quadro">
        <Coluna
          cor={ETAPA.qualificado}
          nome="Qualificado"
          atrasoMs={250}
          contador={<Troca antes="3" depois="2" atrasoMs={2500} />}
        >
          <Card nome="Patrícia R." cor={ETAPA.qualificado} etiqueta={{ texto: "Demonstração", cor: ETIQUETA.demo }} />
          <Card nome="Vinícius S." cor={ETAPA.qualificado} etiqueta={{ texto: "Meta ads", cor: ETIQUETA.meta }} />
        </Coluna>

        <Coluna
          cor={ETAPA.reuniao}
          nome="Reunião Marcada"
          atrasoMs={330}
          contador={<Troca antes="2" depois="3" atrasoMs={2500} />}
        >
          <Card nome="Gustavo P." cor={ETAPA.reuniao} etiqueta={{ texto: "Cal.com", cor: ETIQUETA.cal }} />
          <Card nome="Sofia A." cor={ETAPA.reuniao} etiqueta={{ texto: "Demonstração", cor: ETIQUETA.demo }} />
          {/* A vaga segura o lugar na coluna nova; o card que viaja está solto
              dentro dela, e o CSS o desloca de volta para a coluna de origem. */}
          <div className="pj-vaga">
            <div className="pj-vaga-contorno" />
            <Card viaja nome="Renata C." cor={ETAPA.reuniao} etiqueta={{ texto: "Cal.com", cor: ETIQUETA.cal }} />
          </div>
        </Coluna>

        <Coluna cor={ETAPA.proposta} nome="Proposta Enviada" atrasoMs={410} contador="2">
          <Card nome="Adriana B." cor={ETAPA.proposta} etiqueta={{ texto: "Demonstração", cor: ETIQUETA.demo }} />
          <Card nome="Henrique V." cor={ETAPA.proposta} etiqueta={{ texto: "Cal.com", cor: ETIQUETA.cal }} />
        </Coluna>
      </div>

      <div className="pj-aviso">
        <span className="pj-aviso-icone"><Check size="1em" strokeWidth={2.5} /></span>
        Negócio movido para Reunião Marcada
      </div>
    </Janela>
  );
}

/* ═══ Cena 2: atendimento no WhatsApp ═════════════════════════════════════════
   A lista de conversas aparece, o chat abre e a conversa acontece entre o
   cliente (balão verde claro, à esquerda) e o time (balão amarelo, à direita),
   com os atendentes empilhados no topo: vários atendendo o mesmo número. */

const CONVERSAS = [
  { nome: "Marina Costa", previa: "Oi! Vi o anúncio e queria saber como funciona.", cor: PESSOA.laranja, novas: 2 },
  { nome: "Rafael Lima", previa: "Pode me mandar a proposta?", cor: PESSOA.azul, novas: 0 },
  { nome: "Beatriz Nunes", previa: "Obrigada, combinado!", cor: PESSOA.roxo, novas: 0 },
  { nome: "Diego Prado", previa: "Bom dia! Tudo certo por aí?", cor: PESSOA.marca, novas: 0 },
] as const;

const TIME = [
  { nome: "Ana Ribeiro", cor: PESSOA.cinza },
  { nome: "João Martins", cor: PESSOA.ceu },
  { nome: "Tânia Castro", cor: PESSOA.laranja },
] as const;

const MENSAGENS = [
  { de: "cliente", texto: "Oi! Vi o anúncio e queria saber como funciona.", atrasoMs: 700 },
  { de: "time", texto: "Oi, Marina! Posso te explicar agora mesmo.", atrasoMs: 1500 },
  { de: "cliente", texto: "Pode ser por aqui mesmo?", atrasoMs: 2300 },
  { de: "time", texto: "Claro! Já te mando os detalhes.", atrasoMs: 3100 },
] as const;

export function CenaAtendimento() {
  return (
    <Janela ativo="atendimento" duplo>
      <div className="pj-lista">
        <div className="pj-lista-titulo pj-surge" style={comAtraso(150)}>Conversas</div>
        {CONVERSAS.map((c, i) => (
          <div key={c.nome} className="pj-conversa pj-sobe" data-ativa={i === 0} style={comAtraso(250 + i * 80)}>
            <span className="pj-avatar" style={comCor(c.cor)}><span>{iniciais(c.nome)}</span></span>
            <span className="pj-conversa-texto">
              <span className="pj-linha-nome">{c.nome}</span>
              <span className="pj-linha-previa">{c.previa}</span>
            </span>
            {c.novas > 0 && <span className="pj-selo">{c.novas}</span>}
          </div>
        ))}
      </div>

      <div className="pj-chat">
        <div className="pj-chat-topo pj-surge" style={comAtraso(300)}>
          <span className="pj-avatar" style={comCor(PESSOA.laranja)}><span>MC</span></span>
          <span className="pj-chat-topo-texto">
            <span className="pj-chat-nome">Marina Costa</span>
            <span className="pj-chat-canal">
              <span className="pj-zap"><CrmWhatsAppIcon size="0.8em" /></span>
              WhatsApp
            </span>
          </span>
          <span className="pj-time">
            {TIME.map(p => (
              <span key={p.nome} className="pj-avatar" style={comCor(p.cor)}><span>{iniciais(p.nome)}</span></span>
            ))}
          </span>
        </div>

        <div className="pj-mensagens">
          {MENSAGENS.map(m => (
            <div
              key={m.atrasoMs}
              className={`pj-balao pj-balao--${m.de} pj-sobe`}
              style={comAtraso(m.atrasoMs)}
            >
              {m.texto}
            </div>
          ))}
        </div>

        <div className="pj-entrada">
          <span className="pj-entrada-campo" />
          <span className="pj-enviar"><Send size="0.9em" /></span>
        </div>
      </div>
    </Janela>
  );
}

/* ═══ Cena 3: automações ══════════════════════════════════════════════════════
   O fluxo se monta bloco a bloco, a chave liga, e as execuções passam a
   aparecer no registro. Linha do tempo (ms):

        300-2100   cada bloco entra (a cada 600), e a linha até o próximo
                   cresce logo depois (420 após o bloco)
       3000        a chave vira "Ativa"
       3300-3900   as execuções entram, uma a cada 300 */

const NOS = [
  { cor: BLOCO.inicio, Icone: Play, titulo: "Início", texto: "Lead criado" },
  { cor: BLOCO.mensagem, Icone: MessageCircle, titulo: "Mensagem", texto: "Enviar boas-vindas no WhatsApp" },
  { cor: BLOCO.espera, Icone: Clock, titulo: "Espera", texto: "Aguardar 1 dia" },
  { cor: BLOCO.ia, Icone: Bot, titulo: "IA", texto: "Qualificar o interesse" },
] as const;

const EXECUCOES = [
  { nome: "Beatriz Almeida", acao: "Boas-vindas enviadas", hora: "agora", ok: true },
  { nome: "Rafael Moura", acao: "Boas-vindas enviadas", hora: "há 2 min", ok: true },
  { nome: "Camila Nunes", acao: "Aguardando 1 dia", hora: "há 5 min", ok: false },
] as const;

export function CenaAutomacoes() {
  return (
    <Janela ativo="automacoes">
      <div className="pj-topo pj-surge" style={comAtraso(100)}>
        <div>
          <div className="pj-titulo">Boas-vindas ao lead</div>
          <div className="pj-sub">Automação</div>
        </div>
        <div className="pj-chave" style={comAtraso(3000)}>
          <Troca antes="Inativa" depois="Ativa" atrasoMs={3000} />
          <span className="pj-chave-trilho"><span className="pj-chave-bola" /></span>
        </div>
      </div>

      <div className="pj-canvas">
        {NOS.map((no, i) => (
          <Fragment key={no.titulo}>
            <div className="pj-no pj-sobe" style={comAtrasoECor(300 + i * 600, no.cor)}>
              <div className="pj-no-topo">
                <no.Icone size="1.2em" strokeWidth={2} />
                {no.titulo}
              </div>
              <div className="pj-no-corpo">{no.texto}</div>
            </div>
            {i < NOS.length - 1 && (
              <div className="pj-liga" style={comAtraso(720 + i * 600)}>
                <span className="pj-liga-linha" />
                <span className="pj-liga-ponta" />
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <div className="pj-log">
        <div className="pj-log-titulo pj-surge" style={comAtraso(3100)}>Execuções recentes</div>
        {EXECUCOES.map((e, i) => (
          <div key={e.nome} className="pj-log-linha pj-sobe" style={comAtraso(3300 + i * 300)}>
            <span className={`pj-status ${e.ok ? "pj-status--ok" : "pj-status--espera"}`}>
              {e.ok ? <Check size="0.9em" strokeWidth={2.5} /> : <Clock size="0.9em" strokeWidth={2} />}
            </span>
            <span className="pj-log-nome">{e.nome}</span>
            <span className="pj-log-acao">{e.acao}</span>
            <span className="pj-log-hora">{e.hora}</span>
          </div>
        ))}
      </div>
    </Janela>
  );
}

/* ═══ Cena 4: agentes de IA ═══════════════════════════════════════════════════
   Os três campos do briefing são preenchidos (o que faz, o tom, até onde vai),
   o agente é ligado, e a conversa mostra ele trabalhando. É a mesma frase da
   descrição do destaque, desenhada. Linha do tempo (ms):

        400-1200  os três campos entram, um a cada 400
       1700       a chave vira "Ligado"
       2200-4600  a conversa, uma mensagem a cada 800 */

const CAMPOS = [
  { rotulo: "O que faz", valor: "Qualifica o lead e agenda a reunião", atrasoMs: 400 },
  { rotulo: "Tom de voz", valor: "Simpático e direto", atrasoMs: 800 },
  { rotulo: "Até onde vai", valor: "Passa para o time quando pedirem proposta", atrasoMs: 1200 },
] as const;

const CONVERSA_DO_AGENTE = [
  { de: "cliente", ia: false, texto: "Oi, queria saber os planos.", atrasoMs: 2200 },
  { de: "time", ia: true, texto: "Claro! Quantas pessoas tem no seu time comercial?", atrasoMs: 3000 },
  { de: "cliente", ia: false, texto: "Somos 6.", atrasoMs: 3800 },
  { de: "time", ia: true, texto: "Perfeito. Posso marcar uma conversa com o time amanhã?", atrasoMs: 4600 },
] as const;

export function CenaAgentes() {
  return (
    <Janela ativo="agentes">
      <div className="pj-topo pj-surge" style={comAtraso(100)}>
        <div>
          <div className="pj-titulo">
            <BotMessageSquare size="1.15em" strokeWidth={1.75} />
            Atendente
          </div>
          <div className="pj-sub">Agente de IA</div>
        </div>
        <div className="pj-chave" style={comAtraso(1700)}>
          <Troca antes="Desligado" depois="Ligado" atrasoMs={1700} />
          <span className="pj-chave-trilho"><span className="pj-chave-bola" /></span>
        </div>
      </div>

      <div className="pj-agente-corpo">
        <div className="pj-config">
          {CAMPOS.map(c => (
            <div key={c.rotulo} className="pj-campo pj-sobe" style={comAtraso(c.atrasoMs)}>
              <span className="pj-campo-rotulo">{c.rotulo}</span>
              <span className="pj-campo-valor">{c.valor}</span>
            </div>
          ))}
        </div>

        <div className="pj-agente-chat">
          {CONVERSA_DO_AGENTE.map(m => (
            <div
              key={m.atrasoMs}
              className={`pj-balao pj-balao--${m.de} pj-sobe`}
              style={comAtraso(m.atrasoMs)}
            >
              {m.ia && <span className="pj-ia">IA</span>}
              {m.texto}
            </div>
          ))}
        </div>
      </div>
    </Janela>
  );
}
