import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Priority, LeadOrigin } from "@/data/mockData";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultStage: string;
}

export function NewLeadDialog({ open, onClose, defaultStage }: Props) {
  const { addLead, columns, teamMembers, activePipelineId, nextDealNumber } = useCRM();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [value, setValue] = useState("");
  const [responsible, setResponsible] = useState(teamMembers[0]);
  const [priority, setPriority] = useState<Priority>("Média");
  const [origin, setOrigin] = useState<LeadOrigin>("Instagram");
  const [stage, setStage] = useState(defaultStage);

  const reset = () => { setName(""); setCompany(""); setWhatsapp(""); setValue(""); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !whatsapp) { toast.error("Nome e WhatsApp são obrigatórios."); return; }
    addLead({
      id: `lead-${Date.now()}`,
      dealNumber: nextDealNumber(),
      pipelineId: activePipelineId,
      name, company, whatsapp, value: Number(value) || 0,
      responsible, stage, priority, origin,
      email: "", entryDate: new Date().toISOString().split("T")[0],
      notes: "", activities: [
        { id: `a-${Date.now()}`, date: new Date().toISOString().split("T")[0], type: "created", description: "Lead criado." },
      ],
    });
    toast.success("Lead adicionado!");
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="bg-card border-card-border sm:max-w-md">
        <DialogHeader><DialogTitle className="text-foreground">Novo Lead</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Nome *" value={name} onChange={e => setName(e.target.value)} className="bg-background border-card-border rounded-lg" />
          <Input placeholder="Empresa" value={company} onChange={e => setCompany(e.target.value)} className="bg-background border-card-border rounded-lg" />
          <Input placeholder="WhatsApp *" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="bg-background border-card-border rounded-lg" />
          <Input placeholder="Valor (R$)" type="number" value={value} onChange={e => setValue(e.target.value)} className="bg-background border-card-border rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            <Select value={responsible} onValueChange={setResponsible}>
              <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent className="bg-card border-card-border">{teamMembers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={priority} onValueChange={v => setPriority(v as Priority)}>
              <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                <SelectItem value="Alta">Alta</SelectItem>
                <SelectItem value="Média">Média</SelectItem>
                <SelectItem value="Baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select value={origin} onValueChange={v => setOrigin(v as LeadOrigin)}>
              <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                {["Instagram", "Facebook Ads", "Indicação", "Site", "Outro"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-card-border">{columns.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full rounded-lg font-semibold">Adicionar Lead</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
