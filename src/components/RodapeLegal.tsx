import { useIdioma } from "@/context/IdiomaContext";

/**
 * Rodapé das telas de acesso: direitos reservados e os dois documentos legais.
 *
 * Componente, e não copiado em cada tela, porque é texto jurídico: no dia em
 * que a razão social ou o endereço de um dos documentos mudar, o lugar de
 * corrigir tem que ser um só. Login e cadastro já dividem o mesmo formulário
 * visual; dividem também isto.
 */

const POLITICA = "https://www.rezultcrm.com/politica";
const TERMOS = "https://www.rezultcrm.com/termo";

export function RodapeLegal() {
  const { t } = useIdioma();

  return (
    <p className="shrink-0 pt-6 pb-5 text-center text-[13px] text-muted-foreground">
      {/* `pb-5` são 20px até a borda da tela. A distância mora no componente,
          e não nas páginas, para as três telas de acesso continuarem iguais
          sozinhas.

          O ano sai do relógio, e não escrito à mão: um "©2026" fixo vira
          desatualizado em 1º de janeiro, e ninguém lembra de rodapé. */}
      © {new Date().getFullYear()} Rezult. {t("rodape.direitos")}{" "}
      {/* Peso 500 nos dois documentos: na mesma linha do aviso, é o peso que
          os separa da frase e diz que ali se clica, já que a cor sozinha não
          basta para quem não distingue o verde. */}
      <a
        href={POLITICA}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline transition-colors"
      >
        {t("rodape.politica")}
      </a>
      {" · "}
      <a
        href={TERMOS}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary hover:underline transition-colors"
      >
        {t("rodape.termos")}
      </a>
    </p>
  );
}
