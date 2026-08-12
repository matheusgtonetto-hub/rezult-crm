// Seletor de modelo de mensagem da Cloud API, para quando a janela de 24h
// fechou.
//
// A regra é da Meta, não nossa: passadas 24h da última mensagem do cliente, o
// WhatsApp oficial recusa texto livre e só aceita modelo aprovado. Sem esta
// tela, o atendente escrevia a mensagem inteira, mandava, e só então recebia
// um erro em inglês da Meta -- com o texto já perdido.
//
// Os modelos vêm da própria Meta a cada abertura (não guardamos cópia): eles
// mudam de status sem avisar, e mostrar como aprovado um modelo que foi
// rejeitado ontem produziria exatamente a falha que esta tela existe para
// evitar.

import { useEffect, useState } from "react";
import { Loader2, ChevronLeft, Send, ExternalLink } from "lucide-react";

type Componente = {
  type: string;
  text?: string;
  format?: string;
};

export type Modelo = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: Componente[];
};

// Texto do corpo do modelo, que é o único componente com variáveis que a gente
// preenche hoje. Cabeçalho e rodapé são enviados como o modelo define.
function corpoDoModelo(m: Modelo): string {
  return m.components.find((c) => c.type === "BODY")?.text ?? "";
}

// {{1}}, {{2}}... na ordem em que aparecem. A Meta numera a partir de 1 e não
// garante sequência sem buracos, então a lista sai do texto, não de um contador.
function variaveisDoModelo(m: Modelo): string[] {
  const achadas = corpoDoModelo(m).match(/\{\{\s*\d+\s*\}\}/g) ?? [];
  return [...new Set(achadas.map((v) => v.replace(/[^\d]/g, "")))];
}

function resolverTexto(m: Modelo, valores: Record<string, string>): string {
  return corpoDoModelo(m).replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => valores[n] || `{{${n}}}`);
}

export function WhatsappTemplatePicker({
  wabaId,
  token,
  enviando,
  onEnviar,
}: {
  wabaId: string | null;
  token: string;
  enviando: boolean;
  onEnviar: (modelo: Modelo, valores: Record<string, string>, textoResolvido: string) => void;
}) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<Modelo | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!wabaId || !token) {
      setErro(!wabaId
        ? "Esta conexão não tem o ID da conta do WhatsApp Business gravado. Edite a conexão em Configurações para poder usar modelos."
        : "Conexão sem token.");
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    (async () => {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=200`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = await res.json();
        if (cancelado) return;
        if (!res.ok) {
          setErro(json?.error?.message ?? "Não consegui carregar os modelos da Meta.");
          return;
        }
        // Só APPROVED: oferecer um modelo pendente ou rejeitado seria oferecer
        // um envio que a Meta vai recusar.
        const aprovados = ((json.data ?? []) as Modelo[]).filter((m) => m.status === "APPROVED");
        setModelos(aprovados);
      } catch {
        if (!cancelado) setErro("Não consegui falar com a Meta agora.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [wabaId, token]);

  const variaveis = escolhido ? variaveisDoModelo(escolhido) : [];
  const faltaPreencher = variaveis.some((v) => !(valores[v] ?? "").trim());

  if (carregando) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 2px", fontSize: 13, color: "#888" }}>
        <Loader2 size={14} className="animate-spin" /> Carregando modelos aprovados…
      </div>
    );
  }

  if (erro) {
    return <div style={{ padding: "10px 2px", fontSize: 12, color: "#DC2626" }}>{erro}</div>;
  }

  if (!modelos.length) {
    return (
      <div style={{ padding: "10px 2px", fontSize: 12, color: "#666", lineHeight: 1.5 }}>
        Nenhum modelo aprovado nesta conta ainda. Crie um no{" "}
        <a
          href="https://business.facebook.com/wa/manage/message-templates"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#128A68", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}
        >
          WhatsApp Manager <ExternalLink size={11} />
        </a>{" "}
        para conseguir retomar conversas paradas há mais de 24h.
      </div>
    );
  }

  if (!escolhido) {
    // Agrupado por categoria porque a Meta trata Utilidade e Marketing de
    // formas diferentes: Marketing tem limite diário por contato e pode ser
    // silenciado por quem recebe. Quem escolhe precisa ver isso antes.
    const porCategoria = modelos.reduce<Record<string, Modelo[]>>((acc, m) => {
      const chave = m.category === "UTILITY" ? "Utilidade"
        : m.category === "MARKETING" ? "Marketing"
        : m.category === "AUTHENTICATION" ? "Autenticação"
        : "Outros";
      (acc[chave] ??= []).push(m);
      return acc;
    }, {});

    return (
      <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(porCategoria).map(([categoria, lista]) => (
          <div key={categoria}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
              {categoria}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lista.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setEscolhido(m); setValores({}); }}
                  style={{ width: "100%", textAlign: "left", background: "#FFF", border: "1px solid #EEEEEE", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#CCCCCC")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#EEEEEE")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{m.name}</span>
                    <span style={{ fontSize: 10, color: "#767676", background: "#F5F5F5", borderRadius: 4, padding: "1px 5px" }}>{m.language}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {corpoDoModelo(m)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setEscolhido(null)}
        style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", padding: 0, marginBottom: 8, fontSize: 12, color: "#767676", cursor: "pointer" }}
      >
        <ChevronLeft size={13} /> outros modelos
      </button>

      {variaveis.map((v) => (
        <div key={v} style={{ marginBottom: 8 }}>
          <label style={{ display: "block", fontSize: 11, color: "#767676", marginBottom: 3 }}>Variável {"{{"}{v}{"}}"}</label>
          <input
            value={valores[v] ?? ""}
            onChange={(e) => setValores((s) => ({ ...s, [v]: e.target.value }))}
            placeholder={`Valor para {{${v}}}`}
            style={{ width: "100%", border: "1px solid #EEEEEE", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
        </div>
      ))}

      {/* Prévia com os valores já aplicados: é o que o cliente vai ler, e é a
          última chance de perceber um "Olá {{1}}" sem nome. */}
      <div style={{ background: "#F5F5F5", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#111", whiteSpace: "pre-wrap", marginBottom: 8, lineHeight: 1.45 }}>
        {resolverTexto(escolhido, valores)}
      </div>

      <button
        onClick={() => onEnviar(escolhido, valores, resolverTexto(escolhido, valores))}
        disabled={faltaPreencher || enviando}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: faltaPreencher || enviando ? "#E5E5E5" : "#128A68",
          color: faltaPreencher || enviando ? "#AAA" : "#FFF",
          border: "none", borderRadius: 8, padding: "7px 14px",
          fontSize: 13, fontWeight: 600, cursor: faltaPreencher || enviando ? "default" : "pointer",
        }}
      >
        {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        Enviar modelo
      </button>
    </div>
  );
}
