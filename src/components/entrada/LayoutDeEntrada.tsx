import type { ReactNode } from "react";
import { SeletorDeIdioma } from "@/components/SeletorDeIdioma";
import { SeletorDeTema } from "@/components/SeletorDeTema";
import { RodapeLegal } from "@/components/RodapeLegal";
import { PainelDeFuncionalidades } from "@/components/entrada/PainelDeFuncionalidades";

/**
 * A casca do login e do cadastro: o formulário à esquerda e, em tela larga, o
 * painel de destaques do produto à direita.
 *
 * É componente, e não copiado nas duas páginas, pelo mesmo motivo do
 * `RodapeLegal`: login e cadastro precisam ser a MESMA tela por baixo. Quem
 * troca de uma para a outra vê só o conteúdo mudar, com o painel parado no
 * lugar, e isso só se mantém se o esqueleto for um só.
 *
 * ─── Coluna do formulário ───────────────────────────────────────────────────
 *
 * Três partes em coluna: o cabeçalho (voltar à esquerda, idioma e tema à
 * direita), o miolo que cresce e o rodapé legal. O `flex-1` do miolo é o que
 * empurra o rodapé para o fim da tela; centralizar tudo junto o deixaria
 * grudado no formulário, no meio.
 *
 * O cabeçalho é uma linha NO FLUXO, e não os seletores soltos num canto com
 * `absolute` como eram. Com o painel à direita, o canto da página passou a ser
 * do painel, e o canto da coluna, num celular de 360px, é onde o formulário
 * sobe e cobriria os seletores. Na linha, nada se sobrepõe em tamanho nenhum.
 *
 * `min-h-[100dvh]` e não `h-screen overflow-hidden` (11/10/2026): num aparelho
 * curto ou deitado, o `overflow-hidden` cortava o botão de entrar sem deixar
 * rolar. O `min-h` mantém o rodapé no fim quando sobra espaço, e deixa a
 * página crescer quando falta. `dvh` e não `vh` porque no celular a barra do
 * navegador entra na conta do `vh`.
 *
 * ─── Painel ─────────────────────────────────────────────────────────────────
 *
 * Grudado ao topo (`sticky`) e com a altura da janela: o formulário de
 * cadastro é alto e a página rola, e o painel fica onde está em vez de subir
 * junto. Some abaixo de 1024px. A tela de entrada usa a largura do aparelho
 * (ver `src/lib/viewport.ts`), então o `lg:` do Tailwind enxerga o celular como
 * celular, o que não vale no resto do app.
 */
export function LayoutDeEntrada({ children, voltar }: { children: ReactNode; voltar?: ReactNode }) {
  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-2" style={{ background: "var(--fundo-entrada)" }}>
      <main className="flex min-h-[100dvh] min-w-0 flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between pt-5">
          <div>{voltar}</div>
          <div className="flex items-center gap-2"><SeletorDeIdioma /><SeletorDeTema /></div>
        </header>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        <RodapeLegal />
      </main>

      <aside className="hidden lg:sticky lg:top-0 lg:block lg:h-[100dvh] lg:self-start lg:py-6 lg:pr-6">
        <PainelDeFuncionalidades />
      </aside>
    </div>
  );
}
