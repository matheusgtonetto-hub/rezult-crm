import { useEffect, useState } from "react";

// Menu de ações de uma mensagem, com submenu de um nível.
//
// Existe compartilhado porque as duas telas de chat precisam do mesmo: o
// posicionamento que vira para cima quando não cabe, o fechamento que não engole
// os próprios cliques, e a segunda etapa do "Apagar". São três detalhes que já
// deram trabalho uma vez, e nenhum deles é sobre o Multiatendimento ou sobre o
// chat flutuante em particular.
//
// O que NÃO vem para cá: quais ações existem e o que cada uma faz. Isso depende
// do tipo de mensagem de cada tela e fica com quem chama.

export interface ItemMenuMensagem {
  rotulo: string;
  icone: React.ReactNode;
  /** Ação direta. Ignorada quando há submenu. */
  acao?: () => void;
  /** Abre uma segunda etapa no lugar de agir, como o "Apagar" do WhatsApp. */
  submenu?: ItemMenuMensagem[];
  desabilitado?: boolean;
  /** Explicação do porquê está desabilitado, mostrada ao passar o mouse. */
  motivo?: string;
  /** Pinta o rótulo de vermelho. Para ações destrutivas. */
  destrutivo?: boolean;
}

export function MenuDaMensagem({
  itens, aberto, paraCima, onFechar,
}: {
  itens: ItemMenuMensagem[];
  aberto: boolean;
  paraCima: boolean;
  onFechar: () => void;
}) {
  const [submenu, setSubmenu] = useState<ItemMenuMensagem[] | null>(null);

  // Volta para a primeira etapa sempre que abre ou fecha. Sem isso, o próximo
  // menu abriria direto no submenu do anterior, sem contexto nenhum.
  useEffect(() => { if (!aberto) setSubmenu(null); }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      // Ignora cliques no próprio menu e no botão que o abriu.
      //
      // A primeira versão fechava em QUALQUER clique, em fase de captura. A
      // captura desce do document até o alvo, então o menu saía do DOM antes de
      // o clique chegar no item -- e nenhuma ação funcionava. O fechamento
      // engolia os próprios botões.
      if ((e.target as HTMLElement)?.closest?.("[data-menu-mensagem]")) return;
      onFechar();
    };
    document.addEventListener("click", fechar, { capture: true });
    return () => document.removeEventListener("click", fechar, { capture: true });
  }, [aberto, onFechar]);

  if (!aberto) return null;
  const lista = submenu ?? itens;

  return (
    <div
      data-menu-mensagem
      style={{
        position: "absolute", right: 4, zIndex: 20,
        ...(paraCima ? { bottom: 24 } : { top: 24 }),
        background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: 4, minWidth: 150,
      }}
    >
      {lista.map(item => (
        <button
          key={item.rotulo}
          disabled={item.desabilitado}
          title={item.motivo}
          onClick={() => {
            if (item.desabilitado) return;
            if (item.submenu) { setSubmenu(item.submenu); return; }
            item.acao?.();
            onFechar();
          }}
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "none", border: "none",
            cursor: item.desabilitado ? "not-allowed" : "pointer",
            padding: "7px 10px", borderRadius: 6, fontSize: 13,
            color: item.desabilitado ? "#AAA" : (item.destrutivo ? "#B91C1C" : "#111"),
            textAlign: "left", whiteSpace: "nowrap",
          }}
          onMouseEnter={e => { if (!item.desabilitado) e.currentTarget.style.background = "#F5F5F5"; }}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          {item.icone}{item.rotulo}
        </button>
      ))}
    </div>
  );
}

/**
 * Decide se o menu deve abrir para cima, a partir do botão que o disparou.
 *
 * A conversa rola e a mensagem mais recente fica colada no rodapé, então a
 * mensagem em que mais se clica é justamente a com menos espaço abaixo. Medir no
 * clique, e não no render, porque a posição depende de onde a lista está rolada.
 */
export function menuAbreParaCima(botao: HTMLElement, alturaDoMenu = 130): boolean {
  const r = botao.getBoundingClientRect();
  const lista = (botao.closest("[data-lista-mensagens]") as HTMLElement | null)?.getBoundingClientRect();
  return !!lista && lista.bottom - r.bottom < alturaDoMenu;
}
