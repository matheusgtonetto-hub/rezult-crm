import { useState, useEffect } from "react";
import { useCRM } from "@/context/CRMContext";
import { Lead } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// Extraído de LeadsPage.tsx (era o Dialog "Criar negócio" do menu (...) de
// cada linha) pra ser reaproveitado também pelo botão "+ Negócio" do
// Multiatendimento -- mesmo popup nos dois lugares, não uma cópia parecida.
interface Props {
  lead: Lead | null;
  onClose: () => void;
}

export function CreateDealDialog({ lead, onClose }: Props) {
  const { pipelines, addLead, nextDealNumber } = useCRM();
  const [dealPipeline, setDealPipeline] = useState("");
  const [dealStage, setDealStage] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (lead) {
      const p = pipelines[0];
      setDealPipeline(p?.id ?? "");
      setDealStage(p?.columns[0]?.id ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead]);

  const dealPipelineObj = pipelines.find(p => p.id === dealPipeline);

  const confirmDeal = async () => {
    if (!lead || !dealPipeline || !dealStage) return;
    setCreating(true);
    const ok = await addLead({
      ...lead,
      id: undefined as unknown as string,
      dealNumber: nextDealNumber(),
      pipelineId: dealPipeline,
      stage: dealStage,
      contactId: lead.id,
      activities: [{
        id: `a-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        type: "created",
        description: `Negócio criado a partir do lead ${lead.name}.`,
      }],
    });
    setCreating(false);
    // addLead já mostra o toast de erro (ex.: contato com negócio aberto) --
    // não fecha o diálogo nesse caso.
    if (!ok) return;
    toast.success("Negócio criado!");
    onClose();
  };

  return (
    <Dialog open={!!lead} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Criar negócio</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Vincule <strong>{lead?.name}</strong> a um pipeline e etapa.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Pipeline</label>
            <Select
              value={dealPipeline}
              onValueChange={v => {
                setDealPipeline(v);
                const p = pipelines.find(x => x.id === v);
                setDealStage(p?.columns[0]?.id ?? "");
              }}
            >
              <SelectTrigger className="border-card-border focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
              <SelectContent>
                {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Etapa</label>
            <Select value={dealStage} onValueChange={setDealStage}>
              <SelectTrigger className="border-card-border focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(dealPipelineObj?.columns ?? []).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmDeal} disabled={creating || !dealPipeline || !dealStage} className="bg-[#128A68] hover:bg-[#128A68]/90">
            {creating ? "Criando…" : "Criar negócio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
