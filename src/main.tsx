import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { lerTemaLocal, aplicarTema } from "./lib/tema";

/*
 * O tema entra antes do React desenhar qualquer coisa.
 *
 * O ProfileProvider também aplica a classe, mas só depois de montar, e isso já
 * é um quadro inteiro de tela clara para quem escolheu escuro. Aqui é uma
 * leitura síncrona do localStorage, antes do primeiro pixel.
 */
aplicarTema(lerTemaLocal());

createRoot(document.getElementById("root")!).render(<App />);
