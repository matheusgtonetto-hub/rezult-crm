# Rezult CRM — Design System

> Referência visual e técnica do projeto. Baseado no código-fonte atual (maio/2026).

---

## 1. Cores

### Variáveis CSS (definidas em `src/index.css`)

Todas as cores usam o formato HSL sem `hsl()` wrapper, conforme convenção do shadcn/ui. Aplicadas via `hsl(var(--nome))`.

#### Tema Light (padrão)

| Token | HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--primary` | `163 77% 31%` | `#128A68` | Cor principal da marca (verde) |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Texto sobre fundo primário |
| `--accent` | `151 100% 80%` | `#6EE7B7` | Destaque suave |
| `--accent-foreground` | `163 77% 20%` | `#0C5C46` | Texto sobre accent |
| `--background` | `210 14% 97%` | `#F4F6F8` | Fundo global |
| `--foreground` | `0 0% 6.7%` | `#111111` | Texto principal |
| `--card` | `0 0% 100%` | `#FFFFFF` | Fundo de cards |
| `--card-foreground` | `0 0% 6.7%` | `#111111` | Texto em cards |
| `--card-border` | `40 10% 91%` | `#E8E7E0` | Bordas de cards e inputs |
| `--muted` | `210 14% 94%` | `#ECEEF0` | Fundos atenuados |
| `--muted-foreground` | `0 0% 45%` | `#737373` | Textos secundários |
| `--border` | `40 10% 91%` | `#E8E7E0` | Bordas gerais |
| `--input` | `40 10% 91%` | `#E8E7E0` | Borda de inputs |
| `--ring` | `163 77% 31%` | `#128A68` | Foco (ring) |
| `--destructive` | `0 81% 60%` | `#EF4444` | Vermelho / erro |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | Texto sobre destructive |
| `--secondary` | `210 14% 94%` | `#ECEEF0` | Fundo secundário |
| `--secondary-foreground` | `0 0% 15%` | `#262626` | Texto sobre secondary |
| `--popover` | `0 0% 100%` | `#FFFFFF` | Fundo de popovers |
| `--popover-foreground` | `0 0% 6.7%` | `#111111` | Texto em popovers |

#### Sidebar

| Token | HSL | Uso |
|---|---|---|
| `--sidebar-background` | `163 77% 31%` | Fundo da sidebar (verde primário) |
| `--sidebar-foreground` | `0 0% 100%` | Ícones e textos |
| `--sidebar-primary` | `163 77% 31%` | Cor de destaque |
| `--sidebar-accent` | `165 77% 30% / 0.15` | Hover/active fundo |

#### Semânticas / Soft tints

| Token | HSL | Hex | Uso |
|---|---|---|---|
| `--success` | `163 77% 31%` | `#128A68` | Sucesso |
| `--success-soft` | `151 100% 93%` | `#D1FAE5` | Badge/fundo de sucesso |
| `--destructive-soft` | `0 86% 97%` | `#FEF2F2` | Badge/fundo de erro |
| `--warning` | `38 93% 51%` | `#F59E0B` | Alerta |
| `--warning-soft` | `48 100% 94%` | `#FEF3C7` | Badge/fundo de alerta |
| `--info` | `217 91% 60%` | `#3B82F6` | Informação |

#### Cores de origem de lead (hardcoded nos components)

```ts
Instagram:    "#E1306C"
Facebook Ads: "#1877F2"
Indicação:    "#10B981"
Site:         "#6366F1"
Outro:        "#94A3B8"
```

#### Cores inline da Sidebar (constantes em `AppSidebar.tsx`)

```ts
const SIDEBAR_BG    = "hsl(var(--primary))"
const ICON_INACTIVE = "rgba(255,255,255,0.5)"
const ICON_ACTIVE   = "#FFFFFF"
const HOVER_BG      = "rgba(255,255,255,0.1)"
const ACTIVE_BG     = "rgba(255,255,255,0.15)"
```

---

## 2. Tipografia

### Família

| Família | Variável CSS | Uso |
|---|---|---|
| **Inter** | `font-sans` | Corpo, headings, UI geral |
| **Geist Mono** | `font-mono` | Código, valores numéricos |

Inter é carregada via Google Fonts. Geist Mono via arquivo local em `node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2`.

```css
@font-face {
  font-family: "Geist Mono";
  src: url("../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2") format("woff2");
  font-weight: 100 900;
}
```

### Tamanhos recorrentes no projeto

| Classe Tailwind | px | Uso típico |
|---|---|---|
| `text-[10px]` | 10px | Labels ultra-pequenos, badges internos |
| `text-[11px]` | 11px | Labels de campo (`text-muted-foreground`) |
| `text-xs` | 12px | Textos de suporte, metadados, badges |
| `text-sm` | 14px | Corpo padrão, inputs, botões |
| `text-base` | 16px | Texto de parágrafo |
| `text-lg` | 18px | Títulos de dialog |
| `text-xl` | 20px | Subtítulos de página |
| `text-2xl` | 24px | Títulos de card |
| `text-3xl` | 30px | Métricas do Dashboard |

### Pesos recorrentes

| Classe Tailwind | Valor | Uso típico |
|---|---|---|
| `font-normal` | 400 | Texto corrido |
| `font-medium` | 500 | Labels, items de menu |
| `font-semibold` | 600 | Títulos de seção, nomes |
| `font-bold` | 700 | Logo, valores de destaque |

### Branding do logo

```css
.logo-re   { color: hsl(var(--foreground)); font-weight: 700; }
.logo-zult { color: hsl(var(--primary));    font-weight: 700; }
```

---

## 3. Border Radius

### Valores padrão (Tailwind config)

```ts
borderRadius: {
  lg:  "var(--radius)",       // 0.5rem = 8px
  md:  "calc(var(--radius) - 2px)",  // 6px
  sm:  "calc(var(--radius) - 4px)",  // 4px
}
```

### Por componente

| Componente | Valor | Classe ou `style` |
|---|---|---|
| Cards Kanban | `12px` | `rounded-xl` |
| Colunas Kanban | `12px` | `rounded-xl` |
| Botões padrão (shadcn) | `6px` | `rounded-md` |
| Botões da sidebar | `15px` | `style={{ borderRadius: 15 }}` |
| Inputs da sidebar / dialogs | `15px` | `style={{ borderRadius: 15 }}` |
| Logo RZ | `8px` | `style={{ borderRadius: 8 }}` |
| Company icon | `8px` | `style={{ borderRadius: 8 }}` |
| Badge de tipo | `8px` | `style={{ borderRadius: 8 }}` |
| Badges (shadcn) | `full` | `rounded-full` |
| Dialog | `8px` | `sm:rounded-lg` |
| Popover / Select | `6px` | `rounded-md` |
| Notification popover | `12px` | `rounded-xl` |
| Avatar do usuário | `50%` | `rounded-full` |
| Color picker dots | `50%` | `rounded-full` |

---

## 4. Espaçamentos

### Padding recorrente

| Contexto | Valor | Classe |
|---|---|---|
| Dialog padrão | `20px` | `p-5` |
| Card shadcn | `24px` | `p-6` |
| Sidebar (vertical) | `12px top/bottom` | `pt-3 pb-3` |
| Nav item | sem padding externo | centra via `flex items-center justify-center` |
| Inputs (small) | `8px lateral` | `px-2` |
| Inputs (padrão) | `12px lateral, 8px vertical` | `px-3 py-2` |
| Header de página | `24px lateral, 16-20px vertical` | `px-6 py-4/5` |
| Kanban column header | `12px lateral, 12px vertical` | `px-3 py-3` |
| Lead cards | `8px lateral, 8px bottom` | `px-2 pb-2` |

### Gap recorrente

| Contexto | Valor | Classe |
|---|---|---|
| Sidebar entre ícones | `4px` | `gap-1` |
| Chips de tipo de atividade | `6px` | `gap-1.5` |
| Grupos de botões | `4–8px` | `gap-1` / `gap-2` |
| Grid de campos (3 colunas) | `8px` | `gap-2` |
| Seções dentro de dialog | `8–12px` | `space-y-2` / `space-y-3` |
| Items de lista | `8px` | `space-y-2` |
| Cor picker grid | `6px` | `gap-1.5` |

### Margin

| Contexto | Valor | Classe |
|---|---|---|
| Main content (sidebar offset) | `52px` | `marginLeft: 52` |
| Label acima de campo | `4px` | `mb-1` |
| Dividers na sidebar | auto (entre grupos) | `my-1` |

---

## 5. Componentes UI (shadcn/ui)

### Button

**Arquivo:** `src/components/ui/button.tsx`

**Base:**
```tsx
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md
text-sm font-medium ring-offset-background transition-colors
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
disabled:pointer-events-none disabled:opacity-50
```

**Variantes:**

| Variante | Classes |
|---|---|
| `default` | `bg-primary text-primary-foreground hover:bg-primary/90 glow-primary-hover` |
| `destructive` | `bg-destructive text-destructive-foreground hover:bg-destructive/90` |
| `outline` | `border border-input bg-background hover:bg-accent hover:text-accent-foreground` |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` |
| `link` | `text-primary underline-offset-4 hover:underline` |

**Tamanhos:**

| Size | Classes |
|---|---|
| `default` | `h-10 px-4 py-2` |
| `sm` | `h-9 rounded-md px-3` |
| `lg` | `h-11 rounded-md px-8` |
| `icon` | `h-10 w-10` |

**Exemplos:**
```tsx
<Button>Salvar</Button>
<Button variant="outline" size="sm">Cancelar</Button>
<Button variant="destructive">Excluir</Button>
<Button variant="ghost" size="icon"><MoreHorizontal size={16} /></Button>
```

---

### Input

**Arquivo:** `src/components/ui/input.tsx`

```tsx
flex h-10 w-full rounded-md border border-input bg-background px-3 py-2
text-base ring-offset-background placeholder:text-muted-foreground
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
```

**Uso customizado nos dialogs** (menor, com `style`):
```tsx
<Input
  className="h-8 text-xs border-card-border bg-background"
  style={{ borderRadius: 15 }}
  placeholder="..."
/>
```

---

### Dialog

**Arquivo:** `src/components/ui/dialog.tsx`

**DialogOverlay:**
```
fixed inset-0 z-50 bg-black/80
```

**DialogContent:**
```
fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%]
gap-4 border bg-background p-6 shadow-lg sm:rounded-lg
```
Animação: `zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%]`

**DialogTitle:** `text-lg font-semibold leading-none tracking-tight`

**DialogDescription:** `text-sm text-muted-foreground`

**Padrão de uso no projeto** (dialogs customizados):
```tsx
<DialogContent
  className="bg-card border-card-border sm:max-w-lg p-5"
  style={{ borderRadius: 15 }}
>
```

---

### Card

**Arquivo:** `src/components/ui/card.tsx`

```tsx
// Card base
rounded-lg border bg-card text-card-foreground shadow-sm

// CardHeader
flex flex-col space-y-1.5 p-6

// CardContent
p-6 pt-0

// CardTitle
text-2xl font-semibold leading-none tracking-tight

// CardDescription
text-sm text-muted-foreground
```

---

### Badge

**Arquivo:** `src/components/ui/badge.tsx`

```
inline-flex items-center rounded-full border px-2.5 py-0.5
text-xs font-semibold transition-colors
```

| Variante | Classes |
|---|---|
| `default` | `border-transparent bg-primary text-primary-foreground hover:bg-primary/80` |
| `secondary` | `border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| `destructive` | `border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80` |
| `outline` | `text-foreground` (borda padrão visível) |

---

### Select

**Arquivo:** `src/components/ui/select.tsx`

**SelectTrigger:**
```
flex h-10 w-full items-center justify-between rounded-md border border-input
bg-background px-3 py-2 text-sm ring-offset-background
focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
disabled:cursor-not-allowed disabled:opacity-50
```

**SelectContent:**
```
relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border
bg-popover text-popover-foreground shadow-md
```

**SelectItem:**
```
relative flex w-full cursor-default select-none items-center rounded-sm
py-1.5 pl-8 pr-2 text-sm outline-none
focus:bg-accent focus:text-accent-foreground
```

---

### Popover

**Arquivo:** `src/components/ui/popover.tsx`

**PopoverContent:**
```
z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none
```
Animação: `animate-in fade-in-0 zoom-in-95`

---

## 6. Padrões de Layout

### AppLayout

**Arquivo:** `src/components/AppLayout.tsx`

```tsx
<div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
  <AppSidebar />                     {/* width: 52px, fixed */}
  <main style={{
    marginLeft: 52,                  {/* offset da sidebar */}
    width: "calc(100vw - 52px)",
    height: "100vh",
    overflowY: "auto",
    overflowX: "hidden",
    background: "hsl(var(--background))",
  }}>
    <Outlet />
  </main>
</div>
```

---

### AppSidebar

**Arquivo:** `src/components/AppSidebar.tsx`

```
Largura:     52px
Posição:     fixed, left: 0, top: 0, z-index: 100
Altura:      100vh
Fundo:       hsl(var(--primary)) — verde #128A68
Padding:     12px top/bottom
Estrutura:   flex flex-col items-center
```

**Anatomia vertical:**
```
┌─────────────────┐
│  Logo RZ (32px) │  ← borderRadius: 8px, borda rgba(18,138,104,0.6)
│  Company icon   │  ← borderRadius: 8px, marginBottom: 16px
│  ─────────────  │  ← divider: 1px, rgba(255,255,255,0.15)
│  Nav items      │  ← 36×36px, borderRadius: 15px
│  (flex-1)       │
│  ─────────────  │  ← divider
│  Notificações   │
│  Configurações  │
│  User avatar    │  ← 28×28px, rounded-full
└─────────────────┘
```

**Nav item — estados:**

| Estado | Background | Cor ícone |
|---|---|---|
| Default | `transparent` | `rgba(255,255,255,0.5)` |
| Hover | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.9)` |
| Active | `rgba(255,255,255,0.15)` | `#FFFFFF` |
| Locked | `transparent, opacity: 0.3` | `rgba(255,255,255,0.5)` |

---

### Cards Kanban (Pipeline)

**Arquivo:** `src/pages/PipelinePage.tsx`

**Container da coluna:**
```tsx
<div className="min-w-[280px] w-[280px] h-full flex flex-col rounded-xl
                border border-card-border bg-card shadow-elev-1">
```

**Faixa de cor no topo:**
```tsx
<div className="h-1 w-full rounded-t-lg" style={{ background: col.color }} />
```

**Header da coluna:**
```tsx
<div className="flex items-start justify-between px-3 py-3">
  {/* color picker: 13×13px, rounded-full */}
  <div className="min-w-0">
    <h3 style={{ fontSize: 14, fontWeight: 600, color: "#111111" }}>{col.title}</h3>
    <p className="mt-0.5 whitespace-nowrap" style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
      {formatCurrency(totalValue)} · {count} negócios
    </p>
  </div>
  {/* action button: 28×28px, rounded-md */}
</div>
```

**Lead card:**
```tsx
<div className="bg-background border border-card-border rounded-lg p-3
                shadow-elev-1 cursor-grab active:cursor-grabbing
                hover:shadow-elev-2 transition-shadow">
```

**Paleta de cores de colunas disponíveis (22 cores):**
```ts
["#4ADE80","#34D399","#22D3EE","#60A5FA","#818CF8","#A78BFA",
 "#F472B6","#FB7185","#FCA5A5","#FDBA74","#FCD34D","#A3E635",
 "#2DD4BF","#38BDF8","#7DD3FC","#C084FC","#E879F9","#F9A8D4",
 "#86EFAC","#6EE7B7","#BAE6FD","#DDD6FE"]
```

---

### Header de página padrão

Padrão recorrente nas páginas (`DashboardPage`, `LeadsPage`, etc.):

```tsx
<div className="px-6 py-5 border-b border-card-border bg-card">
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-xl font-semibold text-foreground">Título</h1>
      <p className="text-sm text-muted-foreground mt-0.5">Descrição</p>
    </div>
    <div className="flex items-center gap-2">
      {/* botões de ação */}
    </div>
  </div>
</div>
```

---

## 7. Sombras customizadas

Definidas em `src/index.css` e mapeadas no `tailwind.config.ts`:

| Classe | CSS | Uso |
|---|---|---|
| `shadow-elev-1` | `0 1px 3px rgba(0,0,0,0.06)` | Cards, elementos leves |
| `shadow-elev-2` | `0 2px 8px rgba(0,0,0,0.10)` | Cards em hover, dropdowns |
| `shadow-elev-3` | `0 8px 32px rgba(0,0,0,0.12)` | Modals, painéis elevados |
| `shadow-rail` | `1px 0 4px rgba(0,0,0,0.04)` | Bordas laterais sutis |

---

## 8. Efeitos visuais (glow)

Definidos em `src/index.css`:

| Classe | Descrição | Usado em |
|---|---|---|
| `.glow-pilot` | Animação de brilho verde no ícone | Sidebar — item Pilot |
| `.glow-agentes` | Animação de brilho verde no ícone | Sidebar — item Agentes |
| `.glow-score` | Animação de brilho no score | Componente de score de lead |
| `.glow-rz` | Brilho na borda do logo RZ | Logo da sidebar |
| `.glow-primary-hover` | `box-shadow: 0 0 16px rgba(16,185,129,0.4)` no hover | Botão `default` |

---

## 9. Ícones

**Biblioteca:** `lucide-react`

**Padrão de uso:**
```tsx
import { NomeDoIcone } from "lucide-react"
<NomeDoIcone size={16} strokeWidth={1.75} />
```

**Tamanhos padrão por contexto:**

| Contexto | Size | StrokeWidth |
|---|---|---|
| Sidebar nav | `18` | `1.75` |
| Sidebar rodapé | `16` | padrão |
| Botões de ação | `16` | padrão |
| Labels de campo | `12` | padrão |
| Badges / chips | `10–11` | padrão |
| Inline em texto | `12–14` | padrão |

**Mapeamento da Sidebar:**

| Seção | Ícone |
|---|---|
| Dashboard | `LayoutDashboard` |
| Pipelines | `Filter` |
| Leads | `ContactRound` |
| Calendário | `CalendarDays` |
| Automações | `Workflow` |
| Multiatendimento | `MessagesSquare` |
| Pilot | `Brain` |
| Agentes | `BrainCircuit` |
| Notificações | `Bell` |
| Configurações | `Cog` |
| Rezult Pay | `Wallet` |
| Logout | `LogOut` |

---

## 10. Animações (Tailwind config)

```ts
keyframes: {
  "accordion-down":  { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
  "accordion-up":    { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
  "slide-in-right":  { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
  "slide-out-right": { from: { transform: "translateX(0)" }, to: { transform: "translateX(100%)" } },
}
animation: {
  "accordion-down":  "accordion-down 0.2s ease-out",
  "accordion-up":    "accordion-up 0.2s ease-out",
  "slide-in-right":  "slide-in-right 0.3s ease-out",
  "slide-out-right": "slide-out-right 0.3s ease-out",
}
```

Usado principalmente em:
- `LeadDrawer` — slide-in/out pelo lado direito
- `Accordion` — animação de abertura/fechamento

---

## 11. Padrões de estado de UI

### Loading global (AppLayout)
```tsx
<div className="flex items-center justify-center" style={{ height: "100vh", background: "#F0F4F8" }}>
  <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
</div>
```

### Estado vazio (coluna Kanban)
```tsx
<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
  <p className="text-xs">Nenhum negócio nesta etapa</p>
</div>
```

### Feedback ao usuário
```ts
import { toast } from "sonner"

toast.success("Mensagem de sucesso")
toast.error("Mensagem de erro")
// Sempre em português brasileiro
```

---

## 12. Convenções de código

- UI 100% em **português brasileiro**
- `toast.success()` / `toast.error()` para todo feedback de ação
- Estilos inline (`style={{}}`) usados quando o valor é dinâmico ou fora do padrão Tailwind
- `border-card-border` substituindo `border-border` na maioria dos componentes internos
- `bg-card` para superfícies elevadas sobre `bg-background`
- Tamanho `h-8` (32px) preferido para inputs e botões menores dentro de dialogs
- Tamanho `h-10` (40px) para inputs e botões no padrão shadcn
