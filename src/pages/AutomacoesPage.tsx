import { useState, useRef, useEffect } from "react";
import {
  Search, Power, Plus, ChevronDown, ChevronRight, Filter, GripVertical,
  MessageCircle, Zap, Clock, Shuffle, Braces, ListChecks, Sparkles, Code2,
  Play, Ban, Copy, Pencil, Clipboard, Download, Maximize2, Trash2,
  Minus, ArrowLeft, ArrowRight, User, ChevronLeft,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Automation = { id: string; name: string; active: boolean };
type Group = { id: string; name: string; items: Automation[] };

const INITIAL_GROUPS: Group[] = [
  {
    id: "g1", name: "Automação", items: [
      { id: "a1", name: "Envio Boas Vindas", active: true },
      { id: "a2", name: "Qualificado", active: false },
      { id: "a3", name: "APP Marketing", active: true },
      { id: "a4", name: "APP Marketing - Ganho", active: false },
      { id: "a5", name: "Follow-Up", active: true },
      { id: "a6", name: "TAG ABAAS", active: false },
    ]
  },
  { id: "g2", name: "Disparos", items: [{ id: "b1", name: "Campanha Black Friday", active: false }] },
  { id: "g3", name: "Rodrigo Pessoal", items: [{ id: "c1", name: "Lembrete diário", active: true }] },
  { id: "g4", name: "Criação de Leads", items: [{ id: "d1", name: "Webhook site", active: true }] },
];

const BLOCKS = [
  { id: "msg", label: "Mensagem", icon: MessageCircle, color: "#378ADD" },
  { id: "act", label: "Ações", icon: Zap, color: "#F59E0B" },
  { id: "cond", label: "Condições", icon: Filter, color: "#128A68" },
  { id: "wait", label: "Espera", icon: Clock, color: "#8B5CF6" },
  { id: "rand", label: "Randomizador", icon: Shuffle, color: "#E24B4A" },
  { id: "api", label: "API", icon: Braces, color: "#6B7280" },
  { id: "fields", label: "Operações de campos", icon: ListChecks, color: "#128A68" },
  { id: "ai", label: "IA", icon: Sparkles, color: "#128A68" },
  { id: "js", label: "JavaScript", icon: Code2, color: "#F59E0B" },
];

type CanvasNode = {
  id: string;
  type: "start" | "condition" | "randomizer" | "message" | "action" | "wait" | "api" | "fields" | "ai" | "js";
  x: number; y: number;
  label: string;
};

const INITIAL_NODES: CanvasNode[] = [
  { id: "n1", type: "start", x: 80, y: 120, label: "Início" },
  { id: "n2", type: "condition", x: 400, y: 120, label: "Condição" },
  { id: "n3", type: "randomizer", x: 760, y: 120, label: "Randomizador" },
];

export default function AutomacoesPage() {
  const [groups] = useState(INITIAL_GROUPS);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ g1: true });
  const [selectedId, setSelectedId] = useState<string | null>("a1");
  const [automationStates, setAutomationStates] = useState<Record<string, boolean>>(
    () => Object.fromEntries(INITIAL_GROUPS.flatMap(g => g.items.map(i => [i.id, i.active])))
  );
  const [search, setSearch] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("g1");
  const [newActive, setNewActive] = useState(true);

  const [nodes, setNodes] = useState<CanvasNode[]>(INITIAL_NODES);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedAutomation = groups.flatMap(g => g.items).find(i => i.id === selectedId);

  const handleDragStart = (e: React.DragEvent, blockId: string) => {
    e.dataTransfer.setData("blockId", blockId);
  };
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData("blockId");
    if (!blockId) return;
    const block = BLOCKS.find(b => b.id === blockId);
    if (!block) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    const typeMap: Record<string, CanvasNode["type"]> = {
      msg: "message", act: "action", cond: "condition", wait: "wait",
      rand: "randomizer", api: "api", fields: "fields", ai: "ai", js: "js",
    };
    setNodes(prev => [...prev, {
      id: `n${Date.now()}`, type: typeMap[blockId], x, y, label: block.label,
    }]);
    toast.success(`Bloco "${block.label}" adicionado`);
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panRef.current) return;
      setPan({ x: panRef.current.baseX + e.clientX - panRef.current.startX, y: panRef.current.baseY + e.clientY - panRef.current.startY });
    };
    const onUp = () => { panRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) {
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(z => Math.max(0.4, Math.min(2, z + delta)));
    }
  };

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Informe um nome"); return; }
    toast.success(`Automação "${newName}" criada`);
    setCreateOpen(false);
    setNewName("");
  };

  const filteredGroups = groups.map(g => ({
    ...g,
    items: g.items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
  })).filter(g => !search || g.items.length > 0);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", background: "#F4F6F8", overflow: "hidden" }}>
      {/* PAINEL 1 — LISTA */}
      {!leftCollapsed && (
        <aside style={{ width: 240, minWidth: 240, background: "#FFFFFF", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
          <div style={{ padding: 12, borderBottom: "0.5px solid #E5E5E5" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#AAAAAA" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar automação..."
                style={{ width: "100%", background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: "8px 32px 8px 30px", fontSize: 12, outline: "none" }}
              />
              <Power size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#AAAAAA", cursor: "pointer" }} />
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              style={{ width: "100%", marginTop: 8, background: "#128A68", color: "#FFFFFF", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
            >
              <Plus size={14} /> Adicionar automação
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredGroups.map(g => {
              const open = openGroups[g.id] ?? false;
              return (
                <div key={g.id}>
                  <button
                    onClick={() => setOpenGroups(s => ({ ...s, [g.id]: !open }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#666666", letterSpacing: 0.3 }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {g.name}
                    </span>
                    <span style={{ fontSize: 10, color: "#AAAAAA" }}>{g.items.length}</span>
                  </button>
                  {open && g.items.map(item => {
                    const sel = selectedId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className="group"
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                          background: sel ? "#FFFFFF" : "transparent",
                          borderLeft: sel ? "3px solid #128A68" : "3px solid transparent",
                          cursor: "pointer",
                        }}
                      >
                        <Filter size={14} color="#128A68" />
                        <span style={{ flex: 1, fontSize: 13, color: "#111111", fontWeight: sel ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </span>
                        <Switch
                          checked={automationStates[item.id]}
                          onCheckedChange={(v) => {
                            setAutomationStates(s => ({ ...s, [item.id]: v }));
                            toast.success(`${item.name} ${v ? "ativada" : "desativada"}`);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="scale-75"
                        />
                        <GripVertical size={12} color="#CCCCCC" className="opacity-0 group-hover:opacity-100" />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setLeftCollapsed(true)}
            style={{ position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%", background: "#FFFFFF", border: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
          >
            <ChevronLeft size={14} color="#666666" />
          </button>
        </aside>
      )}
      {leftCollapsed && (
        <button onClick={() => setLeftCollapsed(false)} style={{ width: 24, height: 60, alignSelf: "center", background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderLeft: "none", borderRadius: "0 8px 8px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronRight size={14} color="#666666" />
        </button>
      )}

      {/* PAINEL 2 — BLOCOS */}
      <aside style={{ width: 200, minWidth: 200, background: "#FFFFFF", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", padding: "16px 12px", overflowY: "auto", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111111", marginBottom: 12 }}>Blocos básicos</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {BLOCKS.map(b => {
            const Icon = b.icon;
            return (
              <div
                key={b.id}
                draggable
                onDragStart={(e) => handleDragStart(e, b.id)}
                style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: "10px 12px", cursor: "grab", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#111111", transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#128A68"; e.currentTarget.style.background = "#E1F5EE"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.background = "#FFFFFF"; }}
              >
                <Icon size={14} color={b.color} />
                <span>{b.label}</span>
              </div>
            );
          })}
        </div>
      </aside>

      {/* PAINEL 3 — CANVAS */}
      <section style={{ flex: 1, position: "relative", overflow: "hidden", background: "#F4F6F8", backgroundImage: "radial-gradient(circle, rgba(221,221,221,0.6) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
        {!selectedAutomation && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 5 }}>
            <Zap size={64} color="#E5E5E5" />
            <div style={{ fontSize: 16, color: "#AAAAAA" }}>Selecione uma automação</div>
            <div style={{ fontSize: 13, color: "#CCCCCC" }}>ou crie uma nova para começar</div>
            <button onClick={() => setCreateOpen(true)} style={{ marginTop: 8, background: "#128A68", color: "#FFFFFF", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> Criar automação
            </button>
          </div>
        )}

        {selectedAutomation && (
          <>
            {/* Toolbar */}
            <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "#FFFFFF", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", padding: "8px 12px", display: "flex", gap: 4, zIndex: 20 }}>
              {[
                { icon: Ban, label: "Desativar" },
                { icon: Copy, label: "Duplicar" },
                { icon: Pencil, label: "Editar" },
                { icon: Clipboard, label: "Copiar" },
                { icon: Download, label: "Download" },
                { icon: Maximize2, label: "Expandir" },
              ].map((t, i) => {
                const Icon = t.icon;
                return (
                  <button key={i} title={t.label} style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none", color: "#666666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#F5F5F5"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <Icon size={16} />
                  </button>
                );
              })}
              <div style={{ width: 1, background: "#E5E5E5", margin: "0 4px" }} />
              <button title="Excluir" style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none", color: "#E24B4A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#FEE2E2"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <Trash2 size={16} />
              </button>
            </div>

            {/* Canvas Surface */}
            <div
              ref={canvasRef}
              onMouseDown={onCanvasMouseDown}
              onWheel={onWheel}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleCanvasDrop}
              style={{ position: "absolute", inset: 0, cursor: panRef.current ? "grabbing" : "grab" }}
            >
              <div style={{ position: "absolute", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
                {/* Connectors SVG */}
                <svg style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }} width="2000" height="800">
                  <defs>
                    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#CCCCCC" />
                    </marker>
                  </defs>
                  {nodes.slice(0, -1).map((n, i) => {
                    const next = nodes[i + 1];
                    const x1 = n.x + 240; const y1 = n.y + 100;
                    const x2 = next.x; const y2 = next.y + 100;
                    return <line key={n.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#CCCCCC" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#arr)" />;
                  })}
                </svg>

                {nodes.map(n => (
                  <CanvasBlock key={n.id} node={n} selected={selectedNode === n.id} onSelect={() => setSelectedNode(n.id)} />
                ))}
              </div>
            </div>

            {/* Zoom controls */}
            <div style={{ position: "absolute", right: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 4, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 4, zIndex: 20 }}>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} style={zoomBtn}><Plus size={14} /></button>
              <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} style={zoomBtn}><Minus size={14} /></button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={zoomBtn}><Maximize2 size={14} /></button>
            </div>

            {/* Nav arrows */}
            <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 4, zIndex: 20 }}>
              <button style={zoomBtn}><ArrowLeft size={14} /></button>
              <button style={zoomBtn}><ArrowRight size={14} /></button>
            </div>
          </>
        )}
      </section>

      {/* Modal Nova automação */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nova automação</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <Label className="text-xs">Nome da automação</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Boas-vindas pós-cadastro" />
            </div>
            <div>
              <Label className="text-xs">Grupo</Label>
              <Select value={newGroup} onValueChange={setNewGroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Label className="text-xs">Ativar imediatamente</Label>
              <Switch checked={newActive} onCheckedChange={setNewActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} style={{ background: "#128A68" }}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const zoomBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", color: "#666666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

function CanvasBlock({ node, selected, onSelect }: { node: CanvasNode; selected: boolean; onSelect: () => void }) {
  const width = node.type === "start" ? 240 : 260;
  const borderColor = selected ? "#128A68" : node.type === "start" ? "#CCCCCC" : node.type === "condition" ? "rgba(18,138,104,0.3)" : "#E5E5E5";
  const borderStyle = node.type === "start" ? "dashed" : "solid";

  return (
    <div
      data-node
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: "absolute", left: node.x, top: node.y, width,
        background: "#FFFFFF", border: `${selected ? 2 : 1.5}px ${borderStyle} ${borderColor}`,
        borderRadius: 12, padding: 14, cursor: "pointer", boxShadow: selected ? "0 4px 12px rgba(18,138,104,0.15)" : "none",
      }}
    >
      {node.type === "start" && <StartBody />}
      {node.type === "condition" && <ConditionBody />}
      {node.type === "randomizer" && <RandomizerBody />}
      {!["start", "condition", "randomizer"].includes(node.type) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>{node.label}</div>
        </div>
      )}
      <Metrics />
    </div>
  );
}

function StartBody() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: "0.5px solid #F0F0F0" }}>
        <Play size={14} fill="#128A68" color="#128A68" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Início</span>
      </div>
      <div style={{ paddingTop: 10 }}>
        <div style={{ fontSize: 12, color: "#666666", marginBottom: 8, lineHeight: 1.4 }}>
          O gatilho é responsável por acionar a automação. Clique para adicionar um gatilho:
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#DBEAFE", color: "#185FA5", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
          <Braces size={10} /> Api-request-1
        </div>
        <div style={{ padding: "6px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#666666" }}>
            <User size={12} /> Iniciado por outra automação
          </div>
          <div style={{ fontSize: 11, color: "#AAAAAA", marginLeft: 18 }}>Quando a automação é iniciada por ou...</div>
        </div>
        <button style={{ width: "100%", border: "1px dashed #CCCCCC", background: "transparent", color: "#AAAAAA", fontSize: 12, padding: "6px", borderRadius: 6, cursor: "pointer", marginTop: 6 }}>
          + Adicionar gatilho
        </button>
        <div style={{ fontSize: 11, color: "#AAAAAA", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Quando o evento ocorrer, então →</span>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#378ADD" }} />
        </div>
      </div>
    </>
  );
}

function ConditionBody() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: "0.5px solid #F0F0F0" }}>
        <Filter size={14} color="#128A68" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Condição</span>
      </div>
      <div style={{ paddingTop: 10 }}>
        <div style={{ fontSize: 12, color: "#666666", marginBottom: 8, lineHeight: 1.4 }}>
          Faça filtros para seguir caminhos diferentes. Clique para adicionar uma condição:
        </div>
        <div style={{ padding: "6px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#111111" }}>
            <User size={12} /> Negócio possui atendentes
          </div>
          <div style={{ fontSize: 11, color: "#AAAAAA", marginLeft: 18 }}>Verifica se o negócio possui atendentes</div>
        </div>
        <button style={{ width: "100%", border: "1px dashed rgba(18,138,104,0.3)", background: "transparent", color: "rgba(18,138,104,0.6)", fontSize: 12, padding: "6px", borderRadius: 6, cursor: "pointer", marginTop: 6 }}>
          + Adicionar condição
        </button>
        <div style={{ fontSize: 11, color: "#AAAAAA", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Se esta condição for verdadeira</span>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#378ADD" }} />
        </div>
        <div style={{ fontSize: 11, color: "#AAAAAA", marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Quando não atender a nenhuma condição</span>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E24B4A" }} />
        </div>
      </div>
    </>
  );
}

function RandomizerBody() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: "0.5px solid #F0F0F0" }}>
        <Shuffle size={14} color="#E24B4A" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Randomizador</span>
      </div>
      <div style={{ paddingTop: 10 }}>
        <div style={{ fontSize: 12, color: "#666666", marginBottom: 8, lineHeight: 1.4 }}>
          Divida o fluxo em ramificações aleatórias. Clique para adicionar um randomizador:
        </div>
        {[
          { l: "A", color: "#378ADD" },
          { l: "B", color: "#128A68" },
        ].map(b => (
          <div key={b.l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#111111", width: 16 }}>{b.l}</span>
            <input defaultValue="50%" style={{ flex: 1, border: "0.5px solid #E5E5E5", borderRadius: 6, padding: "4px 8px", fontSize: 12, outline: "none" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: b.color }} />
          </div>
        ))}
        <button style={{ width: "100%", border: "1px dashed #CCCCCC", background: "transparent", color: "#AAAAAA", fontSize: 12, padding: "6px", borderRadius: 6, cursor: "pointer", marginTop: 6 }}>
          + Adicionar ramificação
        </button>
      </div>
    </>
  );
}

function Metrics() {
  return (
    <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #F0F0F0", fontSize: 11 }}>
      <span style={{ color: "#128A68", fontWeight: 600 }}>0 Sucessos</span>
      <span style={{ color: "#F59E0B", fontWeight: 600 }}>0 Alertas</span>
      <span style={{ color: "#E24B4A", fontWeight: 600 }}>0 Erros</span>
    </div>
  );
}
