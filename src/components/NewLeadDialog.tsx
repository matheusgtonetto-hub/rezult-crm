import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { upsertContact } from "@/lib/contacts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ChevronDown, Check } from "lucide-react";
import type { Priority, LeadOrigin } from "@/data/mockData";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultStage: string;
}

const FIELD_CLS = "bg-card border-gray-400 rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary";
const SELECT_TRIGGER_CLS = "bg-card border-gray-400 rounded-lg focus:ring-0 focus:ring-offset-0 focus:border-primary";

export function NewLeadDialog({ open, onClose, defaultStage }: Props) {
  const { addLead, columns, activePipelineId, nextDealNumber, crmTags, teamMembers } = useCRM();
  const { company: activeCompany } = useCompany();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [value, setValue] = useState("");
  const [responsible, setResponsible] = useState("");
  const [priority, setPriority] = useState<Priority>("Média");
  const [origin, setOrigin] = useState<LeadOrigin>("Instagram");
  const [stage, setStage] = useState(defaultStage);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showResponsiblePicker, setShowResponsiblePicker] = useState(false);

  const reset = () => {
    setName(""); setCompany(""); setWhatsapp(""); setValue(""); setResponsible("");
    setSelectedTags([]); setShowTagPicker(false); setShowResponsiblePicker(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !whatsapp) { toast.error("Nome e WhatsApp são obrigatórios."); return; }
    setLoading(true);
    const personId = activeCompany
      ? await upsertContact({
          companyId: activeCompany.id,
          ownerId:   activeCompany.owner_id,
          name, phone: whatsapp,
        })
      : undefined;
    const ok = await addLead({
      dealNumber: nextDealNumber(),
      pipelineId: activePipelineId,
      name, company, whatsapp,
      value: Number(value) || 0,
      responsible, responsibles: responsible ? [responsible] : [], stage, priority, origin,
      tags: selectedTags,
      email: "",
      entryDate: new Date().toISOString().split("T")[0],
      notes: "",
      personId,
      activities: [
        { id: `a-${Date.now()}`, date: new Date().toISOString().split("T")[0], type: "created", description: "Lead criado." },
      ],
    });
    setLoading(false);
    // addLead já mostra o toast de erro (ex.: contato com negócio aberto) --
    // não fecha o formulário nesse caso, senão o usuário perde o que preencheu.
    if (!ok) return;
    toast.success("Lead adicionado!");
    reset();
    onClose();
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
  };

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent className="bg-card border-card-border sm:max-w-md">
        <DialogHeader><DialogTitle className="text-foreground">Novo Lead</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Nome *" value={name} onChange={e => setName(e.target.value)} className={FIELD_CLS} />
          <Input placeholder="Empresa" value={company} onChange={e => setCompany(e.target.value)} className={FIELD_CLS} />
          <Input placeholder="WhatsApp *" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className={FIELD_CLS} />
          <Input placeholder="Valor (R$)" type="number" value={value} onChange={e => setValue(e.target.value)} className={FIELD_CLS} />

          {/* Responsável — seletor customizado */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowResponsiblePicker(v => !v); setShowTagPicker(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm bg-card transition-colors h-9 ${
                showResponsiblePicker ? "border-primary ring-1 ring-primary/20" : "border-gray-400 hover:border-foreground/30"
              }`}
            >
              <span className={responsible ? "text-foreground" : "text-muted-foreground"}>
                {responsible || "Responsável"}
              </span>
              <ChevronDown size={14} className="text-muted-foreground shrink-0" />
            </button>
            {showResponsiblePicker && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-card-border bg-card shadow-md overflow-hidden max-h-44 overflow-y-auto">
                {teamMembers.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground italic">Nenhum atendente encontrado.</p>
                ) : (
                  teamMembers.map(member => (
                    <button
                      key={member}
                      type="button"
                      onClick={() => { setResponsible(member); setShowResponsiblePicker(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left ${
                        responsible === member ? "bg-primary/5 text-primary font-medium" : "text-foreground"
                      }`}
                    >
                      <span>{member}</span>
                      {responsible === member && <Check size={12} className="text-primary shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Tags — seletor customizado multi-select */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowTagPicker(v => !v); setShowResponsiblePicker(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm bg-card transition-colors min-h-9 ${
                showTagPicker ? "border-primary ring-1 ring-primary/20" : "border-gray-400 hover:border-foreground/30"
              }`}
            >
              {selectedTags.length === 0 ? (
                <span className="text-muted-foreground">Tags</span>
              ) : (
                <div className="flex gap-1 flex-wrap">
                  {selectedTags.map(tagName => {
                    const tag = crmTags.find(t => t.name === tagName);
                    return (
                      <span
                        key={tagName}
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: (tag?.color ?? "#6366f1") + "22", color: tag?.color ?? "#6366f1" }}
                      >
                        {tagName}
                      </span>
                    );
                  })}
                </div>
              )}
              <ChevronDown size={14} className="text-muted-foreground shrink-0 ml-2" />
            </button>
            {showTagPicker && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-card-border bg-card shadow-md overflow-hidden max-h-44 overflow-y-auto">
                {crmTags.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground italic">Nenhuma tag cadastrada.</p>
                ) : (
                  crmTags.map(tag => {
                    const selected = selectedTags.includes(tag.name);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.name)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left ${
                          selected ? "bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className={selected ? "text-foreground font-medium" : "text-foreground"}>{tag.name}</span>
                        </div>
                        {selected && <Check size={12} className="text-primary shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select value={priority} onValueChange={v => setPriority(v as Priority)}>
              <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                <SelectItem value="Alta">Alta</SelectItem>
                <SelectItem value="Média">Média</SelectItem>
                <SelectItem value="Baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={origin} onValueChange={v => setOrigin(v as LeadOrigin)}>
              <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                {["Instagram", "Facebook Ads", "Indicação", "Site", "Outro"].map(o => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className={SELECT_TRIGGER_CLS}><SelectValue placeholder="Estágio" /></SelectTrigger>
            <SelectContent className="bg-card border-card-border">
              {columns.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="submit" className="w-full rounded-lg font-semibold" disabled={loading}>
            {loading ? "Salvando..." : "Adicionar Lead"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
