import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICIONARIOS, IDIOMAS, type Chave, type Idioma } from "@/i18n/dicionarios";

/**
 * Idioma da interface.
 *
 * Fica fora do `CompanyContext` e do perfil de propósito: a escolha precisa
 * valer ANTES do login, na tela onde ainda não existe usuário nem empresa para
 * consultar. Por isso mora no `localStorage`, que é o único lugar que sobrevive
 * a um recarregamento sem sessão.
 *
 * Guardar depois no perfil, para acompanhar a pessoa entre dispositivos, é uma
 * camada a mais que se encaixa aqui sem mudar quem consome: bastaria, ao
 * carregar o perfil, chamar `setIdioma` com o que veio do banco.
 */

const CHAVE_ARMAZENAMENTO = "rz_idioma";

interface IdiomaContextType {
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
  /** Traduz uma chave para o idioma atual. */
  t: (chave: Chave) => string;
}

const IdiomaContext = createContext<IdiomaContextType | null>(null);

/**
 * Primeira visita: segue o idioma do navegador, se for um dos três.
 *
 * `navigator.language` vem como "pt-BR", "en-US", "es-419": interessa só o que
 * vem antes do hífen. Qualquer outro idioma cai no português, que é a língua do
 * produto e de onde estão os clientes.
 */
function idiomaInicial(): Idioma {
  const salvo = localStorage.getItem(CHAVE_ARMAZENAMENTO) as Idioma | null;
  if (salvo && IDIOMAS.includes(salvo)) return salvo;

  const doNavegador = navigator.language?.split("-")[0] as Idioma | undefined;
  return doNavegador && IDIOMAS.includes(doNavegador) ? doNavegador : "pt";
}

export function IdiomaProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdiomaEstado] = useState<Idioma>(idiomaInicial);

  const setIdioma = useCallback((i: Idioma) => {
    setIdiomaEstado(i);
    localStorage.setItem(CHAVE_ARMAZENAMENTO, i);
  }, []);

  // `lang` no <html> não é enfeite: é o que faz o corretor ortográfico do
  // navegador, a leitura de tela e a tradução automática usarem o idioma certo.
  useEffect(() => {
    document.documentElement.lang = idioma === "pt" ? "pt-BR" : idioma;
  }, [idioma]);

  const t = useCallback((chave: Chave) => DICIONARIOS[idioma][chave], [idioma]);

  const valor = useMemo(() => ({ idioma, setIdioma, t }), [idioma, setIdioma, t]);

  return <IdiomaContext.Provider value={valor}>{children}</IdiomaContext.Provider>;
}

export function useIdioma() {
  const ctx = useContext(IdiomaContext);
  if (!ctx) throw new Error("useIdioma precisa estar dentro de IdiomaProvider");
  return ctx;
}
