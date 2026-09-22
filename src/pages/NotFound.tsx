import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: rota inexistente acessada:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-app)]">
      <div className="text-center px-6">
        {/* O "404" é referência, não manchete: quem chega aqui precisa saber o
            que fazer, não ler um número grande. Por isso ele vai em overline
            (11/500, caixa alta) e a frase é que leva o peso de título. */}
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
          Erro 404
        </p>
        <h1 className="mb-2 text-2xl font-semibold tracking-[-0.015em] text-[color:var(--text-heading)]">
          Esta página não existe
        </h1>
        <p className="mb-6 text-sm text-[color:var(--text-muted)]">
          O endereço pode ter mudado, ou o link que trouxe você até aqui está desatualizado.
        </p>
        <a
          href="/"
          className="inline-flex h-10 items-center rounded-lg bg-primary px-[14px] text-sm font-medium text-primary-foreground transition-colors hover:bg-[color:var(--accent-300)] active:bg-[color:var(--accent-500)]"
        >
          Voltar para o início
        </a>
      </div>
    </div>
  );
};

export default NotFound;
