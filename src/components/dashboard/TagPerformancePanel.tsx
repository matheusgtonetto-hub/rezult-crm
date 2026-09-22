import { useMemo } from "react";
import type { Lead, Tag } from "@/data/mockData";
import { fmt, receitaDoGanho } from "./useDashboardHelpers";
import {
  MOLDURA, TABELA, LINHA_CABECALHO, CORPO, LINHA_CORPO, useTabelaPainel, type ColunaTabela,
} from "./TabelaPainel";

interface TagPerformancePanelProps {
  periodLeads: Lead[];
  crmTags: Tag[];
}

export function TagPerformancePanel({ periodLeads, crmTags }: TagPerformancePanelProps) {
  const rows = useMemo(() => {
    // Lead.tags guarda o NOME da tag (não o id) — ver LeadDetailPage.tsx, onde a checagem
    // de tag ativa é sempre feita por t.name.
    return crmTags
      .map(tag => {
        const tagged = periodLeads.filter(l => l.tags?.includes(tag.name));
        const won = tagged.filter(l => l.dealStatus === "won");
        const lost = tagged.filter(l => l.dealStatus === "lost");
        const closed = won.length + lost.length;
        const totalValue = won.reduce((s, l) => s + receitaDoGanho(l), 0);
        return {
          tag,
          count: tagged.length,
          won: won.length,
          // conversão sobre negócios encerrados (ganhos+perdidos)
          winRate: closed > 0 ? won.length / closed * 100 : 0,
          avgTicket: won.length > 0 ? totalValue / won.length : 0,
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [periodLeads, crmTags]);

  type Linha = (typeof rows)[number];
  const colunas: ColunaTabela<Linha>[] = [
    { id: "tag", rotulo: "Tag", alinhar: "esquerda", filtro: r => r.tag.name },
    { id: "count", rotulo: "Negócios", valor: r => r.count },
    { id: "winRate", rotulo: "Conversão", valor: r => r.winRate },
    { id: "avgTicket", rotulo: "Ticket médio", valor: r => r.avgTicket },
  ];
  // Abre por volume de negócios, que é a ordem em que as linhas já vinham.
  const { visiveis, cabecalho } = useTabelaPainel(rows, colunas, { coluna: "count", desc: true });

  return (
    <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Performance por tag</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum negócio com tag no período.</p>
      ) : (
        <div className={MOLDURA}>
          <table className={TABELA}>
            <thead>
              <tr className={LINHA_CABECALHO}>
                {colunas.map(c => <th key={c.id} style={c.largura ? { width: c.largura } : undefined}>{cabecalho(c)}</th>)}
              </tr>
            </thead>
            <tbody className={CORPO}>
              {visiveis.map(r => (
                <tr key={r.tag.id} className={LINHA_CORPO}>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.tag.color || "hsl(var(--primary))" }} />
                      <span className="font-medium text-foreground truncate max-w-[140px]">{r.tag.name}</span>
                    </div>
                  </td>
                  <td className="text-center py-2.5 px-3 tabular-nums text-muted-foreground">{r.count}</td>
                  <td className="text-center py-2.5 px-3 tabular-nums font-medium text-foreground">{r.winRate.toFixed(0)}%</td>
                  <td className="text-center py-2.5 px-3 tabular-nums font-semibold text-foreground">{fmt(r.avgTicket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
