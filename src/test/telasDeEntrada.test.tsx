import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdiomaProvider } from "@/context/IdiomaContext";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";

/*
 * Login e cadastro são o primeiro contato de quem vai usar o produto, e o dono
 * pediu mudanças pontuais de texto e de estrutura nelas. Estes testes fixam o
 * que foi pedido e, junto, o que NÃO pode sumir: o pedido original era manter
 * todos os elementos das duas telas.
 *
 * O visual (o verde, o espaçamento) só o navegador mostra; aqui se confere o
 * que está na página, para onde cada coisa leva e o que foi tirado.
 */

// As duas telas leem `useAuth`, cujo contexto real puxa o cliente do Supabase.
// No teste não há URL nem chave, e o `createClient` levantaria exceção só de
// importar. As telas precisam apenas destas funções.
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ signIn: vi.fn(), resetPassword: vi.fn(), signUp: vi.fn() }),
}));

// O cadastro consulta `profiles` depois de criar a conta. Aqui ninguém cria.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

beforeEach(() => {
  localStorage.setItem("rz_idioma", "pt");
});

afterEach(() => {
  localStorage.clear();
});

function renderizar(caminho: "/login" | "/register") {
  return render(
    <IdiomaProvider>
      <MemoryRouter initialEntries={[caminho]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    </IdiomaProvider>,
  );
}

/** A marca com o nome "Rezult CRM" ao lado do símbolo (o nome voltou, dono, 17/11/2026). */
function esperarSimboloENome() {
  expect(screen.getByText("Rezult")).toBeInTheDocument();
  expect(screen.getByText("CRM")).toBeInTheDocument();
}

describe("tela de login", () => {
  it("título e frase novos, e os textos antigos saíram", () => {
    renderizar("/login");

    expect(screen.getByRole("heading", { level: 1, name: "Entre na sua conta" })).toBeInTheDocument();
    expect(screen.getByText(/Ainda não possui uma conta\?/)).toBeInTheDocument();
    expect(screen.queryByText("Bem-vindo ao Rezult")).toBeNull();
    expect(screen.queryByText("Plataforma de gestão de vendas completa")).toBeNull();
  });

  it("'Criar conta' é um link para o cadastro, e não mais um botão", () => {
    renderizar("/login");

    const link = screen.getByRole("link", { name: "Criar conta" });
    expect(link).toHaveAttribute("href", "/register");
    expect(screen.queryByRole("button", { name: "Criar conta" })).toBeNull();
    // um só: o botão e o divisor "ou" que o acompanhava saíram juntos
    expect(screen.getAllByText("Criar conta")).toHaveLength(1);
    expect(screen.queryByText("ou")).toBeNull();
  });

  it("o link é verde: a tinta verde do sistema, que passa no contraste nos dois temas", () => {
    renderizar("/login");

    expect(screen.getByRole("link", { name: "Criar conta" }).className).toContain("text-success-soft-foreground");
  });

  it("'Esqueci minha senha' também é verde", () => {
    renderizar("/login");

    expect(screen.getByRole("button", { name: "Esqueci minha senha" }).className).toContain("text-success-soft-foreground");
  });

  it("clicar em 'Criar conta' abre a tela de cadastro", () => {
    renderizar("/login");

    fireEvent.click(screen.getByRole("link", { name: "Criar conta" }));

    expect(screen.getByRole("heading", { level: 1, name: "Crie a sua conta grátis" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Entre na sua conta" })).toBeNull();
  });

  it("o link de recuperar a senha agora diz 'Esqueci minha senha' e continua abrindo a recuperação", () => {
    renderizar("/login");

    const esqueci = screen.getByRole("button", { name: "Esqueci minha senha" });
    expect(screen.queryByText("Recuperar senha")).toBeNull();

    fireEvent.click(esqueci);

    // o título da tela de recuperação é outro texto, e não foi tocado
    expect(screen.getByRole("heading", { level: 1, name: "Recuperar senha" })).toBeInTheDocument();
  });

  it("a marca mostra o símbolo com o nome, no login e na recuperação de senha", () => {
    renderizar("/login");
    esperarSimboloENome();

    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    esperarSimboloENome();
  });

  it("campos, entrar, mostrar senha e rodapé continuam; idioma e tema saíram", () => {
    renderizar("/login");

    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Idioma" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Tema" })).toBeNull();
    expect(screen.getByText(/Todos os direitos reservados/)).toBeInTheDocument();
  });

  it.each([
    ["en", "Sign in to your account", "Don't have an account yet?", "Create account", "Forgot password"],
    ["es", "Inicia sesión en tu cuenta", "¿Aún no tienes una cuenta?", "Crear cuenta", "Olvidé mi contraseña"],
  ])("em %s os textos novos estão traduzidos", (idioma, titulo, semConta, criar, esqueci) => {
    localStorage.setItem("rz_idioma", idioma);

    renderizar("/login");

    expect(screen.getByRole("heading", { level: 1, name: titulo })).toBeInTheDocument();
    expect(screen.getByText(semConta)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: criar })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("button", { name: esqueci })).toBeInTheDocument();
  });
});

describe("tela de cadastro", () => {
  it("título e frase novos: 'Entre aqui' leva ao login e 'recadastre sua senha' abre a recuperação", () => {
    renderizar("/register");

    expect(screen.getByRole("heading", { level: 1, name: "Crie a sua conta grátis" })).toBeInTheDocument();
    expect(screen.getByText(/Já possui uma conta\?/)).toBeInTheDocument();
    expect(screen.queryByText("Preencha os dados abaixo para começar.")).toBeNull();

    const entre = screen.getByRole("link", { name: "Entre aqui" });
    expect(entre).toHaveAttribute("href", "/login");
    expect(entre.className).toContain("text-success-soft-foreground");

    fireEvent.click(screen.getByRole("link", { name: "recadastre sua senha" }));
    expect(screen.getByRole("heading", { level: 1, name: "Recuperar senha" })).toBeInTheDocument();
  });

  it("'Entre aqui' abre o login na tela de entrar, não na recuperação", () => {
    renderizar("/register");

    fireEvent.click(screen.getByRole("link", { name: "Entre aqui" }));

    expect(screen.getByRole("heading", { level: 1, name: "Entre na sua conta" })).toBeInTheDocument();
  });

  it("a marca mostra o símbolo com o nome, igual ao login", () => {
    renderizar("/register");

    esperarSimboloENome();
  });

  it("nada do que já existia saiu: seta de voltar, os quatro campos, consentimento e o botão", () => {
    renderizar("/register");

    expect(screen.getByRole("button", { name: "Voltar para o login" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar senha")).toBeInTheDocument();
    // o texto de consentimento saiu a pedido do dono (17/11/2026)
    expect(screen.queryByText(/Ao criar minha conta/)).toBeNull();
    // vazio, o botão fica desligado: a regra de antes continua valendo
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Idioma" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Tema" })).toBeNull();
  });
});
