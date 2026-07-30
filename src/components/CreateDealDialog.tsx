import { useState, useEffect } from "react";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { Lead } from "@/data/mockData";
import { upsertContact, type Contact } from "@/lib/contacts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";

// Extraído de LeadsPage.tsx (era o Dialog "Criar negócio" do menu (...) de
// cada linha) pra ser reaproveitado também pelo botão "+ Negócio" do
// Multiatendimento -- mesmo popup nos dois lugares, não uma cópia parecida.
// Aceita duas origens mutuamente exclusivas: `lead` (converte um negócio já
// existente / bare lead legado) ou `contact` (linha "Sem negócio" de /leads,
// pós separação lead/contato -- ver plano de migração).
interface Props {
  lead?: Lead | null;
  contact?: Contact | null;
  onClose: () => void;
}

export function CreateDealDialog({ lead, contact, onClose }: Props) {
  const { pipelines, addLead, nextDealNumber, teamMembers } = useCRM();
  const { company } = useCompany();
  const [dealPipeline, setDealPipeline] = useState("");
  const [dealStage, setDealStage] = useState("");
  const [dealResponsibles, setDealResponsibles] = useState<string[]>([]);
  const [showResponsiblePicker, setShowResponsiblePicker] = useState(false);
  const [creating, setCreating] = useState(false);

  const source = lead ?? contact ?? null;

  useEffect(() => {
    if (source) {
      const p = pipelines[0];
      setDealPipeline(p?.id ?? "");
      setDealStage(p?.columns[0]?.id ?? "");
      setDealResponsibles(lead?.responsibles?.length ? lead.responsibles : (lead?.responsible ? [lead.responsible] : []));
      setShowResponsiblePicker(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const dealPipelineObj = pipelines.find(p => p.id === dealPipeline);

  const confirmDeal = async () => {
    if (!source || !dealPipeline || !dealStage || !company) return;
    setCreating(true);

    // Resolve o contato (pessoa) antes de criar o negócio -- reaproveita
    // personId já conhecido; senão faz upsert por telefone (nunca cria
    // duplicado, ver src/lib/contacts.ts).
    let personId = lead?.personId;
    if (!personId) {
      personId = await upsertContact({
        companyId: company.id,
        ownerId:   company.owner_id,
        name:      source.name,
        phone:     lead ? lead.whatsapp : contact?.phone,
        phoneDdi:  lead ? lead.phoneDdi : contact?.phoneDdi,
        email:     lead ? lead.email : contact?.email,
      });
    }

    const base: Omit<Lead, "id" | "dealNumber" | "pipelineId" | "stage" | "personId" | "activities"> = lead
      ? { ...lead, contactId: lead.id }
      : {
          name:         contact!.name,
          company:      contact!.company,
          whatsapp:     contact!.phone ?? "",
          phoneDdi:     contact!.phoneDdi ?? "+55",
          email:        contact!.email,
          emails:       contact!.email ? [contact!.email] : [],
          tags:         contact!.tags ?? [],
          site:         contact!.site,
          document:     contact!.document,
          origin:       (contact!.origin as Lead["origin"]) ?? "Outro",
          birthDate:    contact!.birthDate,
          country:      contact!.country,
          zipCode:      contact!.zipCode,
          address:      contact!.address,
          addrNumber:   contact!.addrNumber,
          complement:   contact!.complement,
          neighborhood: contact!.neighborhood,
          city:         contact!.city,
          state:        contact!.state,
          notes:        contact!.notes ?? "",
          value:        0,
          responsible:  "",
          responsibles: [],
          priority:     "Média",
          entryDate:    new Date().toISOString().split("T")[0],
        };

    const ok = await addLead({
      ...base,
      dealNumber:   nextDealNumber(),
      pipelineId:   dealPipeline,
      stage:        dealStage,
      personId,
      responsible:  dealResponsibles[0] ?? "",
      responsibles: dealResponsibles,
      // Negócio novo sempre nasce aberto -- se `source` é um Lead já
      // ganho/perdido (cliente recorrente), o spread de `...base` acima
      // carregaria o dealStatus antigo e o estado local ficaria
      // divergente do banco (que sempre grava status "open" no insert).
      dealStatus:   "open",
      activities: [{
        id:          `a-${Date.now()}`,
        date:        new Date().toISOString().split("T")[0],
        type:        "created",
        description: `Negócio criado a partir do lead ${source.name}.`,
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
    <Dialog open={!!source} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Criar negócio</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Vincule <strong>{source?.name}</strong> a um pipeline e etapa.
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
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Responsável</label>
            <Popover open={showResponsiblePicker} onOpenChange={setShowResponsiblePicker}>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-9 w-full items-center justify-between rounded-md border border-card-border bg-card px-3 py-1 text-sm focus:outline-none">
                  <span className={`truncate ${dealResponsibles.length === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                    {dealResponsibles.length === 0 ? "Selecionar" : dealResponsibles.join(", ")}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-1 w-[var(--radix-popover-trigger-width)]">
                {teamMembers.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground italic">Nenhum membro no time.</p>
                ) : teamMembers.map(memberName => {
                  const selected = dealResponsibles.includes(memberName);
                  return (
                    <button key={memberName} type="button" onClick={() => setDealResponsibles(prev => selected ? prev.filter(r => r !== memberName) : [...prev, memberName])} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors">
                      <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${selected ? "bg-primary border-primary" : "border-gray-400"}`}>
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span>{memberName}</span>
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
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
