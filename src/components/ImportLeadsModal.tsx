import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { upsertContact } from "@/lib/contacts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

const NONE = "__none__";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const NAME_KEYS   = ["nome", "name", "cliente", "lead", "razao social", "razao"];
const PHONE_KEYS  = ["telefone", "celular", "fone", "whatsapp", "phone", "mobile", "tel", "contato", "numero", "num"];
const EMAIL_KEYS  = ["email", "e-mail", "correio", "mail"];

// Mesmo sinal que CRMContext::findOpenNegocioConflict usa (telefone normalizado,
// negócio com pipeline aberto) — duplicado aqui só pra conseguir categorizar o
// motivo de cada linha pulada no resumo pós-importação, sem mexer no contrato
// de addLead (usado por muito mais telas além desta).
function normalizeBrPhoneForMatch(raw: string | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}
function phonesMatchForImport(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeBrPhoneForMatch(a);
  const nb = normalizeBrPhoneForMatch(b);
  if (na.length < 10 || nb.length < 10) return false;
  return na.slice(-10) === nb.slice(-10);
}

interface ImportResult {
  name: string;
  phone: string;
  status: "ok" | "duplicate" | "error";
  detail?: string;
}

function autoDetect(headers: string[], keys: string[]) {
  const idx = headers.findIndex(h => keys.some(k => normalize(h).includes(k)));
  return idx >= 0 ? String(idx) : NONE;
}

function toPhoneString(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  // Excel stores phones as numbers — convert and re-add leading zero if needed
  if (typeof val === "number") {
    const s = Math.round(val).toString();
    // Brazilian numbers: 10–11 digits without country code
    return s;
  }
  return String(val).trim();
}

export function ImportLeadsModal({ open, onClose }: Props) {
  const { pipelines, crmTags, addLead, leads: existingLeads, teamMembers, memberColors, memberAvatars } = useCRM();
  const { company } = useCompany();

  const [file, setFile]           = useState<File | null>(null);
  const [headers, setHeaders]     = useState<string[]>([]);
  const [rows, setRows]           = useState<unknown[][]>([]);
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Column mapping
  const [nameCol,  setNameCol]  = useState(NONE);
  const [phoneCol, setPhoneCol] = useState(NONE);
  const [emailCol, setEmailCol] = useState(NONE);

  // Destination
  const [pipelineId, setPipelineId] = useState(() => pipelines[0]?.id ?? "");
  const [stageId,    setStageId]    = useState(() => pipelines[0]?.columns[0]?.id ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedResponsibles, setSelectedResponsibles] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectedPipeline = pipelines.find(p => p.id === pipelineId) ?? pipelines[0] ?? null;

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setHeaders([]);
    setRows([]);
    setParseError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const all  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

        if (!all || all.length < 2) {
          setParseError("Arquivo vazio ou sem dados.");
          return;
        }

        const hdrs = (all[0] as unknown[]).map(h => String(h ?? "").trim());
        const dataRows = all.slice(1).filter(r => (r as unknown[]).some(c => c !== ""));

        if (dataRows.length === 0) {
          setParseError("Nenhuma linha de dados encontrada.");
          return;
        }

        setHeaders(hdrs);
        setRows(dataRows);
        setNameCol(autoDetect(hdrs, NAME_KEYS));
        setPhoneCol(autoDetect(hdrs, PHONE_KEYS));
        setEmailCol(autoDetect(hdrs, EMAIL_KEYS));
      } catch {
        setParseError("Não foi possível ler o arquivo. Use .xlsx, .xls ou .csv.");
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const toggleTag = (name: string) =>
    setSelectedTags(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);

  const previewLeads = rows.slice(0, 3).map(row => ({
    name:  nameCol  !== NONE ? String((row as unknown[])[+nameCol]  ?? "").trim() : "",
    phone: phoneCol !== NONE ? toPhoneString((row as unknown[])[+phoneCol]) : "",
    email: emailCol !== NONE ? String((row as unknown[])[+emailCol] ?? "").trim() : "",
  }));

  const handleImport = async () => {
    if (!rows.length) return;
    if (!pipelineId || !stageId) { toast.error("Selecione um pipeline e uma etapa."); return; }
    if (nameCol === NONE && phoneCol === NONE) {
      toast.error("Mapeie ao menos a coluna de Nome ou Telefone.");
      return;
    }

    setImporting(true);
    const maxNum = Math.max(...Object.values(existingLeads).map(l => l.dealNumber ?? 0), 1000);
    const rowResults: ImportResult[] = [];
    // Telefones já usados nesta MESMA importação — pega duplicata dentro do
    // próprio arquivo, que o snapshot de existingLeads (tirado uma vez, antes
    // do loop) não enxerga porque o state do CRM só atualiza entre renders.
    const importedPhones = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row   = rows[i] as unknown[];
      const name  = nameCol  !== NONE ? String(row[+nameCol]  ?? "").trim() : "";
      const phone = phoneCol !== NONE ? toPhoneString(row[+phoneCol]) : "";
      const email = emailCol !== NONE ? String(row[+emailCol] ?? "").trim() : "";

      const displayName = name || phone || email;
      if (!displayName) continue;

      const normPhone = normalizeBrPhoneForMatch(phone);

      // Mesma regra que addLead vai aplicar — pré-checa só pra dar um motivo
      // claro no resumo, sem duplicar o toast.error que addLead já dispara.
      const existingConflict = Object.values(existingLeads).find(l =>
        l.pipelineId && l.dealStatus === "open" && phonesMatchForImport(l.whatsapp, phone)
      );
      if (existingConflict) {
        rowResults.push({ name: displayName, phone, status: "duplicate", detail: `já tem negócio aberto (#${existingConflict.dealNumber})` });
        continue;
      }
      if (normPhone && importedPhones.has(normPhone)) {
        rowResults.push({ name: displayName, phone, status: "duplicate", detail: "telefone repetido neste arquivo" });
        continue;
      }

      const personId = company
        ? await upsertContact({
            companyId: company.id,
            ownerId:   company.owner_id,
            name:      displayName,
            phone:     phone.replace(/\D/g, "") || undefined,
            email:     email || undefined,
          })
        : undefined;

      const success = await addLead({
        dealNumber: maxNum + i + 1,
        name: displayName,
        whatsapp: phone.replace(/\D/g, ""),
        phoneDdi: "+55",
        email: email || undefined,
        emails: email ? [email] : [],
        company: undefined, site: undefined,
        value: 0,
        responsible: selectedResponsibles[0] ?? "",
        responsibles: selectedResponsibles,
        pipelineId, stage: stageId,
        priority: "Média", origin: "Outro",
        productId: undefined,
        entryDate: new Date().toISOString().split("T")[0],
        nextFollowUp: undefined, notes: "",
        tags: selectedTags,
        document: undefined, birthDate: undefined,
        country: undefined, zipCode: undefined,
        address: undefined, addrNumber: undefined,
        complement: undefined, neighborhood: undefined,
        city: undefined, state: undefined,
        dealStatus: "open", lossReasonId: undefined,
        customFieldValues: {}, activities: [],
        personId,
      });
      if (success) {
        if (normPhone) importedPhones.add(normPhone);
        rowResults.push({ name: displayName, phone, status: "ok" });
      } else {
        rowResults.push({ name: displayName, phone, status: "error", detail: "erro ao criar" });
      }
    }

    setImporting(false);
    setResults(rowResults);
  };

  const handleClose = () => {
    setFile(null); setHeaders([]); setRows([]); setParseError("");
    setNameCol(NONE); setPhoneCol(NONE); setEmailCol(NONE);
    setSelectedTags([]);
    setSelectedResponsibles([]);
    setPipelineId(pipelines[0]?.id ?? "");
    setStageId(pipelines[0]?.columns[0]?.id ?? "");
    setResults(null);
    onClose();
  };

  const colOptions = (
    <>
      <SelectItem value={NONE}>— não mapear —</SelectItem>
      {headers.map((h, i) => (
        <SelectItem key={i} value={String(i)}>{h || `Coluna ${i + 1}`}</SelectItem>
      ))}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar lista de leads</DialogTitle>
        </DialogHeader>

        {results ? (
          <>
            <div className="space-y-4 py-1">
              <div className="rounded-lg border border-card-border p-3 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-primary shrink-0" />
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{results.filter(r => r.status === "ok").length} de {results.length}</span> leads importados.
                  {results.some(r => r.status !== "ok") && (
                    <span className="text-muted-foreground"> {results.filter(r => r.status === "duplicate").length} pulado(s) por já ter negócio aberto, {results.filter(r => r.status === "error").length} com erro.</span>
                  )}
                </p>
              </div>

              {results.some(r => r.status !== "ok") && (
                <div className="rounded-lg border border-card-border overflow-hidden">
                  <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-card-border">
                    Não importados
                  </div>
                  <div className="divide-y divide-muted max-h-[240px] overflow-y-auto">
                    {results.filter(r => r.status !== "ok").map((r, i) => (
                      <div key={i} className="px-3 py-2 text-xs flex items-start gap-2">
                        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{r.name}{r.phone ? ` · ${r.phone}` : ""}</p>
                          <p className="text-muted-foreground">{r.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="bg-primary hover:bg-primary/90">Concluir</Button>
            </DialogFooter>
          </>
        ) : (
        <>
        <div className="space-y-5 py-1">

          {/* Upload zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isDragging ? "border-primary bg-primary/10"
                        : "border-card-border hover:border-primary hover:bg-primary/5"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {!file ? (
              <>
                <Upload size={28} className="mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium text-foreground">Arraste o arquivo aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">Suporta .xlsx, .xls e .csv</p>
              </>
            ) : parseError ? (
              <>
                <AlertCircle size={28} className="mx-auto mb-2 text-red-500" />
                <p className="text-sm font-medium text-red-600">{parseError}</p>
                <p className="text-xs text-muted-foreground mt-1">{file.name}</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <FileSpreadsheet size={22} className="text-primary" />
                  <CheckCircle2 size={18} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-primary">
                  {rows.length} linha{rows.length !== 1 ? "s" : ""} encontrada{rows.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{file.name}</p>
              </>
            )}
          </div>

          {/* Column mapping */}
          {headers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-foreground">
                Mapeamento de colunas
                <span className="text-muted-foreground font-normal ml-1">— confirme ou ajuste a detecção automática</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Nome", value: nameCol,  set: setNameCol },
                  { label: "Telefone", value: phoneCol, set: setPhoneCol },
                  { label: "E-mail", value: emailCol,  set: setEmailCol },
                ].map(({ label, value, set }) => (
                  <div key={label} className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
                    <Select value={value} onValueChange={set}>
                      <SelectTrigger className="h-8 text-xs rounded-lg focus:ring-0 focus:ring-offset-0 focus:border-primary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>{colOptions}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <div className="rounded-lg border border-card-border overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-card-border">
                Pré-visualização
              </div>
              <div className="divide-y divide-muted">
                {previewLeads.map((l, i) => (
                  <div key={i} className="px-3 py-2 text-xs text-foreground flex gap-3">
                    <span className="font-medium truncate flex-1 min-w-0">{l.name || <span className="text-muted-foreground/50">—</span>}</span>
                    <span className="text-muted-foreground shrink-0 w-28">{l.phone || <span className="text-muted-foreground/50">—</span>}</span>
                    <span className="text-muted-foreground truncate max-w-[120px]">{l.email || <span className="text-muted-foreground/50">—</span>}</span>
                  </div>
                ))}
                {rows.length > 3 && (
                  <div className="px-3 py-1.5 text-xs text-muted-foreground">
                    + {rows.length - 3} linha{rows.length - 3 !== 1 ? "s" : ""} a mais...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pipeline */}
          {rows.length > 0 && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Pipeline</label>
                <Select
                  value={pipelineId}
                  onValueChange={id => {
                    setPipelineId(id);
                    const p = pipelines.find(p => p.id === id);
                    setStageId(p?.columns[0]?.id ?? "");
                  }}
                >
                  <SelectTrigger className="h-9 text-sm rounded-lg focus:ring-0 focus:ring-offset-0 focus:border-primary">
                    <SelectValue placeholder="Selecione o pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPipeline && selectedPipeline.columns.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Etapa</label>
                  <Select value={stageId} onValueChange={setStageId}>
                    <SelectTrigger className="h-9 text-sm rounded-lg focus:ring-0 focus:ring-offset-0 focus:border-primary">
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedPipeline.columns.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {crmTags.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">
                    Tags <span className="text-muted-foreground font-normal">(opcional)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {crmTags.map(tag => {
                      const active = selectedTags.includes(tag.name);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.name)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                          style={{
                            background:   active ? tag.color + "22" : "transparent",
                            borderColor:  active ? tag.color : "#DDDDDD",
                            color:        active ? tag.color : "#666",
                          }}
                        >
                          {active && <X size={10} />}
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {teamMembers.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">
                    Responsáveis <span className="text-muted-foreground font-normal">(opcional)</span>
                  </label>
                  <div className="border border-card-border rounded-lg p-2 space-y-0.5 max-h-[130px] overflow-y-auto">
                    {teamMembers.map(name => {
                      const selected = selectedResponsibles.includes(name);
                      const avatar = memberAvatars[name];
                      const color = memberColors[name] ?? "#AAAAAA";
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() =>
                            setSelectedResponsibles(prev =>
                              prev.includes(name) ? prev.filter(r => r !== name) : [...prev, name]
                            )
                          }
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors hover:bg-muted"
                        >
                          <div
                            className="flex items-center justify-center rounded shrink-0"
                            style={{
                              width: 14, height: 14,
                              border: selected ? `2px solid ${color}` : "1.5px solid #CCCCCC",
                              background: selected ? color : "transparent",
                            }}
                          >
                            {selected && (
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </div>
                          {avatar ? (
                            <img src={avatar} alt={name} className="rounded-full object-cover shrink-0" style={{ width: 20, height: 20 }} />
                          ) : (
                            <div className="rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{ width: 20, height: 20, background: color, fontSize: 9 }}>
                              {name[0].toUpperCase()}
                            </div>
                          )}
                          <span className="text-xs" style={{ fontWeight: selected ? 600 : 400 }}>{name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedResponsibles.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {selectedResponsibles.length === 1
                        ? `1 responsável selecionado`
                        : `${selectedResponsibles.length} responsáveis selecionados`}
                      {" — "}será aplicado a todos os leads importados.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importing}>Cancelar</Button>
          <Button
            onClick={handleImport}
            disabled={!rows.length || importing || !pipelineId || !stageId}
            className="bg-primary hover:bg-primary/90 min-w-[140px]"
          >
            {importing
              ? "Importando..."
              : rows.length
                ? `Importar ${rows.length} lead${rows.length !== 1 ? "s" : ""}`
                : "Importar leads"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
