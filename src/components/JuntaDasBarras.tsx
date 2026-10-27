/**
 * O encontro arredondado das réguas da barra superior e da lateral.
 *
 * A linha vem da direita pela régua da barra superior, faz uma curva de
 * `--junta-barras` (16px) no canto e desce pela régua da lateral até o pé da
 * tela (dono, 26/10/2026). Para a esquerda da curva, sob a marca, não há linha.
 *
 * Tudo aqui é desenho por cima, `pointer-events: none`: as duas barras mantêm a
 * borda de 1px, só que transparente, e por isso nenhum botão, ícone ou texto
 * delas mudou de lugar para a curva existir.
 *
 * As três peças acompanham `--barra-largura` com a mesma transição da lateral,
 * para a curva andar junto quando ela abre ou recolhe.
 *
 * Fica de fora no celular: lá a lateral vira gaveta por cima do conteúdo, não
 * há coluna fixa para a linha descer, e a régua de cima atravessa a tela.
 */

/** Acima da lateral (30) e abaixo das cortinas e diálogos (45 em diante). */
const CAMADA = 31;

/** O x da régua da lateral: o último pixel da coluna dela. */
const X_DA_REGUA = "calc(var(--barra-largura) - 1px)";

/** O y da régua de cima: o último pixel da barra superior. */
const Y_DA_REGUA = "calc(var(--topbar-h) - 1px)";

const ANDA_JUNTO = "left var(--dur-normal) var(--ease-out)";

export function JuntaDasBarras() {
  return (
    <>
      {/* O canto de fora da curva, na cor das barras. Sem isto, o pedaço entre
          a curva e o canto vivo mostraria o fundo da página, que no tema
          escuro não é o das barras. O círculo transparente tem o mesmo centro
          e o mesmo raio da curva logo abaixo. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: X_DA_REGUA,
          top: Y_DA_REGUA,
          width: "var(--junta-barras)",
          height: "var(--junta-barras)",
          background:
            "radial-gradient(circle at 100% 100%, transparent calc(var(--junta-barras) - 1px), var(--surface-card) var(--junta-barras))",
          pointerEvents: "none",
          zIndex: CAMADA,
          transition: ANDA_JUNTO,
        }}
      />
      {/* A curva: só as bordas de cima e da esquerda de um quadrado com o
          canto arredondado no raio inteiro, o que desenha um quarto de
          círculo. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: X_DA_REGUA,
          top: Y_DA_REGUA,
          width: "var(--junta-barras)",
          height: "var(--junta-barras)",
          boxSizing: "border-box",
          borderTop: "1px solid var(--border-default)",
          borderLeft: "1px solid var(--border-default)",
          borderTopLeftRadius: "var(--junta-barras)",
          pointerEvents: "none",
          zIndex: CAMADA,
          transition: ANDA_JUNTO,
        }}
      />
      {/* A régua da lateral, do fim da curva até o pé da tela. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: X_DA_REGUA,
          top: `calc(${Y_DA_REGUA} + var(--junta-barras))`,
          bottom: 0,
          width: 1,
          background: "var(--border-default)",
          pointerEvents: "none",
          zIndex: CAMADA,
          transition: ANDA_JUNTO,
        }}
      />
    </>
  );
}
