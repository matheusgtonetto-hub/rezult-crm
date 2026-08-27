import { FundoDoCrm } from "@/components/FundoDoCrm";

/**
 * Tela de espera entre "Criar conta" e a escolha do plano.
 *
 * Mora aqui, e não dentro do cadastro, porque as DUAS pontas precisam dela: o
 * cadastro enquanto grava a conta, e a tela de planos enquanto descobre se a
 * empresa existe e se o passo a passo já foi visto. Se cada uma tivesse a sua,
 * a diferença de um pixel entre elas viraria um pisca no meio da transição.
 *
 * Sendo a mesma, a pessoa não percebe que trocou de página: a barra chega a
 * 100% no cadastro, a navegação acontece por baixo, e a tela de planos continua
 * segurando a mesma imagem até ter tudo para mostrar de uma vez.
 *
 * O fundo é a réplica estática do CRM, e não o CRM de verdade: o de verdade
 * monta a tela de início inteira, com as consultas dela, que é justamente o que
 * estamos esperando terminar. Carregá-lo aqui atrasaria o que ele deveria
 * adiantar.
 */
export function TelaPreparandoConta({ progresso }: { progresso: number }) {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "hsl(var(--background))" }}
    >
      <FundoDoCrm />
      {/* `relative` sobre o fundo fixo: sem posicionamento próprio o conteúdo
          entraria embaixo dele e sumiria atrás do véu. */}
      <div className="relative w-full max-w-[420px] text-center">
        <div className="flex justify-center mb-8">
          <img src="/logo-rezult.png?v=2" alt="Rezult CRM" className="h-10 w-auto" />
        </div>
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Estamos preparando sua conta...</h2>
        <p className="text-sm text-muted-foreground mb-8">Isso vai levar apenas alguns segundos.</p>
        <div className="w-full bg-border rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full"
            style={{ width: `${progresso}%`, transition: "width 40ms linear" }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-3">{progresso}%</p>
      </div>
    </div>
  );
}
