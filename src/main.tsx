import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { temaInicial, aplicarTema } from "./lib/tema";
import { ajustarViewport } from "./lib/viewport";

/*
 * O tema entra antes do React desenhar qualquer coisa.
 *
 * O ProfileProvider também aplica a classe, mas só depois de montar, e isso já
 * é um quadro inteiro de tela clara para quem escolheu escuro. Aqui é uma
 * leitura síncrona do localStorage, antes do primeiro pixel.
 */
aplicarTema(temaInicial(), false);

/*
 * E a largura virtual junto, pelo mesmo motivo: a meta do index.html vale para
 * o app, e as telas de entrada precisam da largura do aparelho. Depois daqui
 * quem mantém isso em dia é o efeito em App.tsx, a cada troca de rota.
 */
ajustarViewport(window.location.pathname);

createRoot(document.getElementById("root")!).render(<App />);
