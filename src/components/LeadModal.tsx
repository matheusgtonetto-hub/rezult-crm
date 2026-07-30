import { useState, useEffect } from "react";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { Lead } from "@/data/mockData";
import { upsertContact, type Contact } from "@/lib/contacts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X, Loader2, Plus, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const DDI_OPTIONS = [
  { code: "+55", flag: "🇧🇷" },
  { code: "+1",  flag: "🇺🇸" },
  { code: "+351",flag: "🇵🇹" },
  { code: "+34", flag: "🇪🇸" },
  { code: "+44", flag: "🇬🇧" },
  { code: "+49", flag: "🇩🇪" },
  { code: "+33", flag: "🇫🇷" },
  { code: "+54", flag: "🇦🇷" },
  { code: "+52", flag: "🇲🇽" },
];

const ORIGINS = ["Instagram", "Facebook Ads", "Indicação", "Site", "Outro"] as const;

const BRASIL_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const empty = {
  name: "",
  tags: [] as string[],
  phoneDdi: "+55",
  whatsapp: "",
  emails: [] as string[],
  site: "",
  document: "",
  company: "",
  responsible: "",
  responsibles: [] as string[],
  origin: "Outro" as string,
  birthDate: "",
  country: "Brasil",
  zipCode: "",
  address: "",
  addrNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  notes: "",
};

type Form = typeof empty;

interface Props {
  open: boolean;
  onClose: () => void;
  editLead?: Lead | null;
  // Edita um contato sem negócio vinculado (linha "Sem negócio" em /leads) --
  // mutuamente exclusivo com editLead: nunca os dois setados ao mesmo tempo.
  editContact?: Contact | null;
  // Valores iniciais pro modo de criação (editLead/editContact ausentes) --
  // ex.: Multiatendimento abrindo o modal já com nome/telefone da conversa, e
  // o contato (personId) já resolvido/criado via ensureContactForConversation
  // antes de abrir.
  prefill?: { name?: string; whatsapp?: string; personId?: string };
}

export function LeadModal({ open, onClose, editLead, editContact, prefill }: Props) {
  const { updateLead, updateContact, pipelines, crmTags, teamMembers } = useCRM();
  const { company } = useCompany();
  const [tab, setTab] = useState("contato");
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState("none");
  const [emailInput, setEmailInput] = useState("");
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showResponsiblePicker, setShowResponsiblePicker] = useState(false);
  const [showPipelinePicker, setShowPipelinePicker] = useState(false);

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (!e || form.emails.includes(e)) return;
    setForm(p => ({ ...p, emails: [...p.emails, e] }));
    setEmailInput("");
  };
  const removeEmail = (e: string) =>
    setForm(p => ({ ...p, emails: p.emails.filter(x => x !== e) }));

  useEffect(() => {
    if (open) {
      setTab("contato");
      setShowTagPicker(false);
      setShowResponsiblePicker(false);
      setShowPipelinePicker(false);
      setSelectedPipelineId(editLead?.pipelineId ?? "none");
      setEmailInput("");
      setForm(editLead ? {
        name:         editLead.name         ?? "",
        tags:         editLead.tags         ?? [],
        phoneDdi:     editLead.phoneDdi     ?? "+55",
        whatsapp:     editLead.whatsapp     ?? "",
        emails:       editLead.emails?.length ? editLead.emails : (editLead.email ? [editLead.email] : []),
        site:         editLead.site         ?? "",
        document:     editLead.document     ?? "",
        company:      editLead.company      ?? "",
        responsible:  editLead.responsible  ?? "",
        responsibles: editLead.responsibles?.length ? editLead.responsibles : (editLead.responsible ? [editLead.responsible] : []),
        origin:       editLead.origin       ?? "Outro",
        birthDate:    editLead.birthDate    ?? "",
        country:      editLead.country      ?? "Brasil",
        zipCode:      editLead.zipCode      ?? "",
        address:      editLead.address      ?? "",
        addrNumber:   editLead.addrNumber   ?? "",
        complement:   editLead.complement   ?? "",
        neighborhood: editLead.neighborhood ?? "",
        city:         editLead.city         ?? "",
        state:        editLead.state        ?? "",
        notes:        editLead.notes        ?? "",
      } : editContact ? {
        ...empty,
        name:         editContact.name         ?? "",
        tags:         editContact.tags         ?? [],
        phoneDdi:     editContact.phoneDdi     ?? "+55",
        whatsapp:     editContact.phone        ?? "",
        emails:       editContact.email ? [editContact.email] : [],
        site:         editContact.site         ?? "",
        document:     editContact.document     ?? "",
        company:      editContact.company      ?? "",
        origin:       editContact.origin       ?? "Outro",
        birthDate:    editContact.birthDate    ?? "",
        country:      editContact.country      ?? "Brasil",
        zipCode:      editContact.zipCode      ?? "",
        address:      editContact.address      ?? "",
        addrNumber:   editContact.addrNumber   ?? "",
        complement:   editContact.complement   ?? "",
        neighborhood: editContact.neighborhood ?? "",
        city:         editContact.city         ?? "",
        state:        editContact.state        ?? "",
        notes:        editContact.notes        ?? "",
      } : { ...empty, name: prefill?.name ?? "", whatsapp: prefill?.whatsapp ?? "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editLead, editContact]);

  const set = (k: keyof Form, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const toggleTag = (tag: string) =>
    setForm(p => ({
      ...p,
      tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag],
    }));

  const fetchCep = async (raw: string) => {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setForm(p => ({
          ...p,
          address:      d.logradouro ?? p.address,
          neighborhood: d.bairro     ?? p.neighborhood,
          city:         d.localidade ?? p.city,
          state:        d.uf         ?? p.state,
        }));
      }
    } catch { /* ignore */ } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      if (editLead) {
        await updateLead(editLead.id, {
          name:         form.name,
          tags:         form.tags,
          phoneDdi:     form.phoneDdi   || undefined,
          whatsapp:     form.whatsapp,
          emails:       form.emails,
          email:        form.emails[0]  || undefined,
          site:         form.site       || undefined,
          document:     form.document   || undefined,
          company:       form.company      || undefined,
          responsibles:  form.responsibles,
          responsible:   form.responsibles[0] ?? "",
          origin:        form.origin as Lead["origin"],
          birthDate:    form.birthDate  || undefined,
          country:      form.country    || undefined,
          zipCode:      form.zipCode    || undefined,
          address:      form.address    || undefined,
          addrNumber:   form.addrNumber || undefined,
          complement:   form.complement || undefined,
          neighborhood: form.neighborhood || undefined,
          city:         form.city       || undefined,
          state:        form.state      || undefined,
          notes:        form.notes,
        });
        toast.success("Lead atualizado!");
        onClose();
      } else if (editContact) {
        await updateContact(editContact.id, {
          name:         form.name,
          tags:         form.tags,
          phoneDdi:     form.phoneDdi   || undefined,
          phone:        form.whatsapp   || undefined,
          email:        form.emails[0]  || undefined,
          site:         form.site       || undefined,
          document:     form.document   || undefined,
          company:      form.company    || undefined,
          origin:       form.origin     || undefined,
          birthDate:    form.birthDate  || undefined,
          country:      form.country    || undefined,
          zipCode:      form.zipCode    || undefined,
          address:      form.address    || undefined,
          addrNumber:   form.addrNumber || undefined,
          complement:   form.complement || undefined,
          neighborhood: form.neighborhood || undefined,
          city:         form.city       || undefined,
          state:        form.state      || undefined,
          notes:        form.notes      || undefined,
        });
        toast.success("Lead atualizado!");
        onClose();
      } else {
        // "Novo Lead" cria só o contato (a pessoa) -- pipeline/responsável são
        // atributos de Negócio, criado depois via "Criar negócio", nunca junto.
        if (!company) return;
        // prefill.personId já veio resolvido (ex.: ensureContactForConversation
        // no Multiatendimento, que pode ter achado o contato por um Lead já
        // linkado, não só por telefone). Reaproveita esse id diretamente em vez
        // de rechamar upsertContact -- se o telefone da conversa divergiu do
        // telefone salvo no contato (Meta Ads/Click-to-WhatsApp, caso real já
        // visto em produção), um upsert por telefone aqui criaria um contato
        // duplicado em vez de completar o mesmo.
        let contactId: string | undefined = prefill?.personId;
        if (contactId) {
          await updateContact(contactId, {
            name:         form.name,
            tags:         form.tags,
            phoneDdi:     form.phoneDdi   || undefined,
            phone:        form.whatsapp   || undefined,
            email:        form.emails[0]  || undefined,
            site:         form.site       || undefined,
            document:     form.document   || undefined,
            company:      form.company    || undefined,
            origin:       form.origin     || undefined,
            birthDate:    form.birthDate  || undefined,
            country:      form.country    || undefined,
            zipCode:      form.zipCode    || undefined,
            address:      form.address    || undefined,
            addrNumber:   form.addrNumber || undefined,
            complement:   form.complement || undefined,
            neighborhood: form.neighborhood || undefined,
            city:         form.city       || undefined,
            state:        form.state      || undefined,
            notes:        form.notes      || undefined,
          });
          toast.success("Lead criado!");
          onClose();
          return;
        }
        contactId = await upsertContact({
          companyId:  company.id,
          ownerId:    company.owner_id,
          name:       form.name,
          phone:      form.whatsapp || undefined,
          phoneDdi:   form.phoneDdi || undefined,
          email:      form.emails[0] || undefined,
          tags:       form.tags,
          site:       form.site || undefined,
          document:   form.document || undefined,
          company:    form.company || undefined,
          origin:     form.origin || undefined,
          birthDate:  form.birthDate || undefined,
          country:    form.country || undefined,
          zipCode:    form.zipCode || undefined,
          address:    form.address || undefined,
          addrNumber: form.addrNumber || undefined,
          complement: form.complement || undefined,
          neighborhood: form.neighborhood || undefined,
          city:       form.city || undefined,
          state:      form.state || undefined,
          notes:      form.notes || undefined,
        });
        if (contactId) {
          toast.success("Lead criado!");
          onClose();
        } else {
          toast.error("Não foi possível criar o lead.");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[560px] p-0 gap-0 overflow-hidden bg-card">

        <DialogHeader className="px-6 pt-5 pb-4">
          <DialogTitle className="text-base font-semibold">
            {editLead || editContact ? "Editar Lead" : "Novo Lead"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Campos fixos: Nome + Tags ── */}
        <div className="px-6 pt-5 pb-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome *</label>
            <Input
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="Nome completo"
              className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              autoFocus
            />
          </div>

          {/* Tags — Popover multi-select */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tags</label>
            <Popover open={showTagPicker} onOpenChange={v => { setShowTagPicker(v); if (v) { setShowResponsiblePicker(false); setShowPipelinePicker(false); } }}>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-7 w-full items-center justify-between rounded-md border border-gray-400 bg-card px-3 py-1 text-sm focus:outline-none">
                  {form.tags.length === 0 ? (
                    <span className="text-muted-foreground">Selecionar tags</span>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {form.tags.map(tagName => {
                        const tag = crmTags.find(t => t.name === tagName);
                        return (
                          <span key={tagName} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: (tag?.color ?? "#6366f1") + "22", color: tag?.color ?? "#6366f1" }}>
                            {tagName}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="p-1 w-[var(--radix-popover-trigger-width)]">
                {crmTags.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground italic">Crie tags em Configurações → Tags.</p>
                ) : crmTags.map(t => {
                  const active = form.tags.includes(t.name);
                  return (
                    <button key={t.id} type="button" onClick={() => toggleTag(t.name)} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors">
                      <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${active ? "bg-primary border-primary" : "border-gray-400"}`}>
                        {active && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span>{t.name}</span>
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>

          {/* Pipeline/Responsável são atributos de Negócio, não de Lead -- só
              aparecem editando um negócio já existente (nunca na criação, que
              cria só o contato). */}
          {editLead && (
          <div className="grid grid-cols-2 gap-4">
            {/* Pipeline — Popover single-select */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pipeline</label>
              <Popover open={showPipelinePicker} onOpenChange={v => { setShowPipelinePicker(v); if (v) { setShowTagPicker(false); setShowResponsiblePicker(false); } }}>
                <PopoverTrigger asChild>
                  <button type="button" className="flex h-7 w-full items-center justify-between rounded-md border border-gray-400 bg-card px-3 py-1 text-sm focus:outline-none">
                    <span className={selectedPipelineId === "none" ? "text-muted-foreground" : "text-foreground"}>
                      {selectedPipelineId === "none" ? "Nenhum" : (pipelines.find(p => p.id === selectedPipelineId)?.name ?? "Nenhum")}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-1 w-[var(--radix-popover-trigger-width)]">
                  {[{ id: "none", name: "Nenhum" }, ...pipelines].map(p => {
                    const selected = selectedPipelineId === p.id;
                    return (
                      <button key={p.id} type="button" onClick={() => { setSelectedPipelineId(p.id); setShowPipelinePicker(false); }} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors">
                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${selected ? "bg-primary border-primary" : "border-gray-400"}`}>
                          {selected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </div>

            {/* Responsável — Popover multi-select */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Responsável</label>
              <Popover open={showResponsiblePicker} onOpenChange={v => { setShowResponsiblePicker(v); if (v) { setShowTagPicker(false); setShowPipelinePicker(false); } }}>
                <PopoverTrigger asChild>
                  <button type="button" className="flex h-7 w-full items-center justify-between rounded-md border border-gray-400 bg-card px-3 py-1 text-sm focus:outline-none">
                    <span className={`truncate ${form.responsibles.length === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                      {form.responsibles.length === 0 ? "Selecionar" : form.responsibles.join(", ")}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-1 w-[var(--radix-popover-trigger-width)]">
                  {teamMembers.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground italic">Nenhum membro no time.</p>
                  ) : teamMembers.map(memberName => {
                    const selected = form.responsibles.includes(memberName);
                    return (
                      <button key={memberName} type="button" onClick={() => { const next = selected ? form.responsibles.filter(r => r !== memberName) : [...form.responsibles, memberName]; set("responsibles", next); }} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors">
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
          )}
        </div>

        {/* ── Sub-abas ── */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 mx-6 mt-4 h-9 bg-green-100 rounded-lg p-1 shrink-0">
            <TabsTrigger value="contato"  className="text-xs rounded-md data-[state=active]:bg-[#128A68] data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-black">Contato</TabsTrigger>
            <TabsTrigger value="pessoal"  className="text-xs rounded-md data-[state=active]:bg-[#128A68] data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-black">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="endereco" className="text-xs rounded-md data-[state=active]:bg-[#128A68] data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-black">Endereço</TabsTrigger>
            <TabsTrigger value="anotacoes"className="text-xs rounded-md data-[state=active]:bg-[#128A68] data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-black">Anotações</TabsTrigger>
          </TabsList>

          {/* Contato */}
          <TabsContent value="contato" className="px-6 pt-4 pb-2 space-y-4 overflow-y-auto max-h-[260px]">
            <Field label="Telefone">
              <div className="flex gap-2">
                <Select value={form.phoneDdi} onValueChange={v => set("phoneDdi", v)}>
                  <SelectTrigger className="h-7 w-[90px] bg-card border-gray-400 text-xs shrink-0 focus:ring-0 focus:ring-offset-0 focus:border-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DDI_OPTIONS.map(d => (
                      <SelectItem key={d.code} value={d.code} className="text-xs">
                        {d.flag} {d.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.whatsapp}
                  onChange={e => set("whatsapp", e.target.value)}
                  placeholder="(11) 99999-0000"
                  className="h-7 bg-card border-gray-400 flex-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                />
              </div>
            </Field>

            <Field label="E-mail">
              <div className="space-y-1.5">
                {/* Chips dos emails cadastrados */}
                {form.emails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.emails.map(e => (
                      <div key={e} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-gray-400">
                        <span className="truncate max-w-[200px]">{e}</span>
                        <button
                          type="button"
                          onClick={() => removeEmail(e)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Input para adicionar novo email */}
                <div className="flex gap-1.5">
                  <Input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); addEmail(emailInput); }
                    }}
                    placeholder="email@exemplo.com"
                    className="h-7 bg-card border-gray-400 flex-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => addEmail(emailInput)}
                    disabled={!emailInput.trim()}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-400 bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors shrink-0"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </Field>

            <Field label="Site">
              <Input
                value={form.site}
                onChange={e => set("site", e.target.value)}
                placeholder="https://exemplo.com"
                className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              />
            </Field>
          </TabsContent>

          {/* Dados Pessoais */}
          <TabsContent value="pessoal" className="px-6 pt-4 pb-2 space-y-4 overflow-y-auto max-h-[260px]">
            <Field label="Documento (CPF / CNPJ)">
              <Input
                value={form.document}
                onChange={e => set("document", e.target.value)}
                placeholder="000.000.000-00"
                className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              />
            </Field>

            <Field label="Empresa">
              <Input
                value={form.company}
                onChange={e => set("company", e.target.value)}
                placeholder="Nome da empresa"
                className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              />
            </Field>

            <Field label="Origem">
              <Select value={form.origin} onValueChange={v => set("origin", v)}>
                <SelectTrigger className="h-7 bg-card border-gray-400 focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Data de Nascimento">
              <Input
                type="date"
                value={form.birthDate}
                onChange={e => set("birthDate", e.target.value)}
                className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              />
            </Field>
          </TabsContent>

          {/* Endereço */}
          <TabsContent value="endereco" className="px-6 pt-4 pb-2 space-y-4 overflow-y-auto max-h-[260px]">
            <Field label="País">
              <Input
                value={form.country}
                onChange={e => set("country", e.target.value)}
                placeholder="Brasil"
                className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              />
            </Field>

            <Field label="CEP">
              <div className="relative">
                <Input
                  value={form.zipCode}
                  onChange={e => { set("zipCode", e.target.value); fetchCep(e.target.value); }}
                  placeholder="00000-000"
                  maxLength={9}
                  className="h-7 bg-card border-gray-400 pr-8 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                />
                {cepLoading && (
                  <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Endereço">
                  <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Rua, Av..." className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary" />
                </Field>
              </div>
              <Field label="Número">
                <Input value={form.addrNumber} onChange={e => set("addrNumber", e.target.value)} placeholder="123" className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary" />
              </Field>
            </div>

            <Field label="Complemento">
              <Input value={form.complement} onChange={e => set("complement", e.target.value)} placeholder="Apto, sala..." className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary" />
            </Field>

            <Field label="Bairro">
              <Input value={form.neighborhood} onChange={e => set("neighborhood", e.target.value)} placeholder="Bairro" className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary" />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Cidade">
                  <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Cidade" className="h-7 bg-card border-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary" />
                </Field>
              </div>
              <Field label="UF">
                <Select value={form.state} onValueChange={v => set("state", v)}>
                  <SelectTrigger className="h-7 bg-card border-gray-400 focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {BRASIL_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </TabsContent>

          {/* Anotações */}
          <TabsContent value="anotacoes" className="px-6 pt-4 pb-2 overflow-y-auto max-h-[260px]">
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Adicione informações relevantes sobre este lead..."
              className="bg-card border-gray-400 min-h-[200px] resize-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 py-4 mt-2 gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-400">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? "Salvando..." : editLead || editContact ? "Salvar alterações" : "Criar Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
