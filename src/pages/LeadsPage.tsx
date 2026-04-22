import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { toast } from "sonner";

export default function ContactsPage() {
  const { leads, columns, teamMembers, deleteLead, setSelectedLeadId } = useCRM();
  const [search, setSearch] = useState("");
  const [filterResp, setFilterResp] = useState("all");
  const [filterStage, setFilterStage] = useState("all");

  const allLeads = Object.values(leads);
  const filtered = allLeads.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.company || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterResp !== "all" && l.responsible !== filterResp) return false;
    if (filterStage !== "all" && l.stage !== filterStage) return false;
    return true;
  });

  const colName = (id: string) => columns.find(c => c.id === id)?.title || id;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Consulte, crie, modifique ou remova seus leads
          </p>
        </div>
        <Button className="rounded-lg font-semibold"><Plus size={16} className="mr-1" /> Novo Lead</Button>
      </div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <Input placeholder="Buscar por nome ou empresa..." value={search} onChange={e => setSearch(e.target.value)} className="bg-card border-card-border rounded-lg max-w-xs" />
        <Select value={filterResp} onValueChange={setFilterResp}>
          <SelectTrigger className="bg-card border-card-border rounded-lg w-40"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent className="bg-card border-card-border">
            <SelectItem value="all">Todos</SelectItem>
            {teamMembers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="bg-card border-card-border rounded-lg w-44"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent className="bg-card border-card-border">
            <SelectItem value="all">Todas</SelectItem>
            {columns.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum lead encontrado.</p>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-card-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nome</TableHead>
                <TableHead className="text-muted-foreground">Empresa</TableHead>
                <TableHead className="text-muted-foreground">WhatsApp</TableHead>
                <TableHead className="text-muted-foreground">Etapa</TableHead>
                <TableHead className="text-muted-foreground">Responsável</TableHead>
                <TableHead className="text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(lead => (
                <TableRow key={lead.id} className="border-card-border hover:bg-secondary/50">
                  <TableCell className="font-medium text-foreground">{lead.name}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.company || "—"}</TableCell>
                  <TableCell>
                    <a href={`https://wa.me/${lead.whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-success hover:underline flex items-center gap-1.5">
                      <WhatsAppIcon size={16} /> {lead.whatsapp}
                    </a>
                  </TableCell>
                  <TableCell><span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{colName(lead.stage)}</span></TableCell>
                  <TableCell className="text-muted-foreground">{lead.responsible}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => setSelectedLeadId(lead.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                      <button onClick={() => { deleteLead(lead.id); toast.success("Lead removido."); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
