# Handoff: Rezult CRM — Visual Identity & Product UI

> Pacote pra implementar a identidade visual do Rezult CRM em **React + Tailwind** com **shadcn/ui**, ambos os temas (light + dark), ícones via **lucide-react**.

---

## 1 · Sobre estes arquivos

Os arquivos `.html` em `references/` são **mockups de design feitos em HTML** — protótipos que mostram a aparência e o comportamento desejados. **Não são código de produção.** A tarefa é **recriar essas telas no seu codebase React + Tailwind + shadcn/ui** seguindo os padrões do seu app.

Os arquivos em `tokens.css`, `tailwind.config.ts`, `design-tokens.ts`, `components/`, `lib/`, `assets/` **são código de produção** — feitos pra colar direto no projeto.

## 2 · Fidelidade

**Hi-fi.** Cores, tipografia, espaçamento e radius são finais. O dev deve recriar pixel-perfect, mas adaptando à arquitetura de componentes do app.

## 3 · Direção visual

- **Vibe:** moderno, técnico, neon outline
- **Cor principal:** verde neon `#00E599` (dark) / verde esmeralda `#00C77F` (light)
- **Tipografia:** Geist (sans) + Geist Mono (dados, eyebrows, scores)
- **Glow signature:** `box-shadow: 0 0 24px rgba(0,229,153,0.5)` em superfícies primárias e estados ativos
- **Eyebrows mono:** rótulos sempre em mono, 10px, letter-spacing 0.14em, uppercase

---

## 4 · Como instalar

### 4.1 Dependências
```bash
npm i clsx tailwind-merge class-variance-authority \
      lucide-react @radix-ui/react-slot \
      tailwindcss-animate
# shadcn (se não tiver):
npx shadcn@latest init
```

### 4.2 Arquivos
1. Copie `tokens.css` → `app/globals.css` (ou importe no topo dele).
2. Substitua `tailwind.config.ts` pelo nosso (ou faça merge da seção `theme.extend`).
3. Copie `lib/utils.ts` → `lib/utils.ts` (sobrescreve o `cn` padrão do shadcn — equivalente).
4. Copie tudo de `components/` → `components/ui/`.
5. Copie `assets/` → `public/brand/` (logos SVG já exportados).

### 4.3 Theme switching
```tsx
// No layout root:
import { useTheme } from "@/lib/utils";

export default function Layout({ children }) {
  const { theme, toggle } = useTheme("dark");
  return <html lang="pt-br" data-theme={theme} className={theme}>...</html>;
}
```

A flag está tanto em `data-theme="dark|light"` quanto em `class="dark"` — assim funciona com qualquer convenção (shadcn usa `.dark`, nós usamos ambas pra facilitar).

---

## 5 · Tokens

### Cores semânticas (theme-aware via CSS vars)
| Token | Dark | Light | Uso |
|---|---|---|---|
| `bg-rz-bg` | `#070A09` | `#FAFAF7` | fundo da página |
| `bg-rz-surface` | `#0E1310` | `#FFFFFF` | cards, painéis |
| `bg-rz-surface-2` | `#161C18` | `#F4F2EC` | inputs, hover |
| `bg-rz-surface-3` | `#1F2722` | `#E8E5DC` | active state |
| `border-rz-border` | rgba branco 8% | rgba preto 8% | divisores |
| `border-rz-border-active` | rgba green 40% | rgba green 50% | focus / hover |
| `text-rz-text` | `#F4F2EC` | `#0E1310` | título, body |
| `text-rz-text-muted` | 62% | 64% | descrições |
| `text-rz-text-subtle` | 36% | 40% | timestamps, eyebrows |
| `bg-rz-primary` | `#00E599` | `#00C77F` | CTA, focus |
| `text-rz-on-primary` | `#001A0F` | `#FFFFFF` | texto sobre primary |

### Semânticos
- `text-rz-success` `#00C77F` · `text-rz-warning` `#F59E0B` · `text-rz-danger` `#EF4444` · `text-rz-info` `#3B82F6` · `text-rz-purple` `#A855F7`

### Tipografia
| Estilo | Tamanho | LH | Letter-spacing | Peso | Uso |
|---|---|---|---|---|---|
| display | 64 | 1.05 | -0.04em | 600 | hero |
| h1 | 48 | 1.10 | -0.035em | 600 | landing |
| h2 | 32 | 1.20 | -0.025em | 600 | seções |
| h3 | 22 | 1.30 | -0.020em | 600 | screen titles |
| title | 16 | 1.40 | -0.015em | 600 | card titles |
| body | 14 | 1.55 | -0.005em | 400 | corpo |
| small | 12 | 1.50 | 0 | 400 | labels |
| eyebrow | 10 | 1.40 | 0.14em | 500 mono UPPER | rótulos técnicos |

### Radius / Spacing / Shadow
- Radius: `xs:4 sm:6 md:10 lg:16 xl:24` (default `md`)
- Spacing: 4px-base — `1:4 2:8 3:12 4:16 5:20 6:24 8:32 10:40 12:48 16:64`
- Shadow: `rz-sm/md/lg` + **`rz-glow`** (signature) = `0 0 24px var(--rz-glow)`
- Motion: `cubic-bezier(0.2,0.8,0.2,1)` · 120ms / 200ms / 400ms

---

## 6 · Componentes incluídos

| Arquivo | Exporta | Notas |
|---|---|---|
| `components/button.tsx` | `Button`, `buttonVariants` | variants: primary, secondary, outline, ghost, danger · sizes: sm/md/lg/icon |
| `components/badge.tsx` | `Badge` | tones: neutral/success/warning/danger/info/purple/primary · prop `dot` |
| `components/input.tsx` | `Input`, `Textarea` | bg-surface-2, focus glow ring |
| `components/card.tsx` | `Card`, `CardHeader/Title/Description/Content/Footer`, `MetricCard` | MetricCard cobre o pattern de KPI das telas |
| `components/lead-card.tsx` | `LeadCard` | card do Kanban — name, value, source, score, hot |
| `components/logo.tsx` | `RezultLogoFilled`, `RezultLogoOutline`, `RezultGlyph`, `RezultWordmark` | usam CSS vars — flipam com tema |
| `components/icon.tsx` | `Icon`, `ICON_MAP`, `MetaIcon`, `GoogleIcon`, `WhatsAppIcon` | wrapper sobre lucide-react |
| `lib/utils.ts` | `cn`, `useTheme` | cn = clsx + tailwind-merge; useTheme = troca dark/light |

### Mapeamento ícones brandbook → lucide
Todos os 12 ícones do brandbook estão mapeados em `components/icon.tsx`:
- pipeline → `KanbanSquare` · inbox → `MessageCircle` · agent → `Bot` · automation → `Workflow` · reports → `BarChart3` · connections → `Plug`
- flame → `Flame` · star → `Star` · phone → `Phone` · mail → `Mail` · building → `Building2` · clock → `Clock`
- meta/google/whatsapp → SVG inline (não tem em lucide)

Use sempre `<Icon name="pipeline" size={16} />` — fica fácil trocar depois.

---

## 7 · Telas

Cada tela está em `references/*.html`. Resumo do layout:

### 7.1 Shell (sidebar 240px + topbar 64px + content)
- Sidebar dark com logo no topo, nav links com ícone+label, item ativo: barra esquerda 2px primary + glow
- Topbar: kicker mono pequeno + título h3 à esquerda · ações à direita (botões secundário + primário)

### 7.2 Pipeline (Kanban)
- 4 KPIs no topo (`MetricCard`): Pipeline total, Taxa fechamento, Tempo médio, Agente IA · respostas
- 4 colunas Kanban com header (dot colorido + nome + contagem mono): Novo / Qualificado / Negociação / Fechado
- Cada coluna é scrollable, fundo `surface`, leads são `LeadCard` em `surface-2`
- Click no LeadCard → Lead Detail

### 7.3 Lead Detail
- Topbar com breadcrumb clicável (← Pipeline / Estágio)
- Grid 2 col: 1fr (timeline) + 320px (right rail)
- 3 cards de score no topo: Score IA (com glow + radial gradient), Valor, Tempo no funil
- Timeline vertical com bolinhas coloridas + linha; eventos: agente, whatsapp, automação, lead capturado
- Right rail: avatar grande + nome + badges + 6 fields com ícone (email, phone, empresa, origem, responsável, criado em)

### 7.4 WhatsApp Inbox (3 col grid)
- Esquerda 320px: lista de chats com avatar, indicador online (dot success), badge IA ativa, contador de não lidos
- Centro: header com avatar/status · stream de mensagens (agente=esquerda surface-2, lead=direita primary) · campo input com /comandos · quick replies
- Direita 280px: card "Sofia · sugestão" com glow + botões Aprovar/Editar · Lead info · próximas ações

### 7.5 Agente IA (split 50/50)
- Esquerda: card hero com avatar gradient da Sofia + status · 4 sections de config (persona, objetivo, base de conhecimento, escalonamento) · grid 2x2 de tools toggleáveis · 3 metrics na base
- Direita: live preview de conversa com indicador "7 ativas" + animação "Sofia digitando…"

### 7.6 Automações (node-based builder)
- Sidebar palette 240px com blocos agrupados: GATILHO, CONDIÇÃO, AÇÃO, DELAY (cada um com cor própria)
- Canvas com fundo dotted (radial-gradient pattern) · nós conectados por bezier paths em primary com glow · nós têm input dot (oco) + output dot (preenchido com glow)
- Node ativo tem `border-rz-border-active` + ring `0 0 0 3px var(--rz-glow)`
- Stats flutuantes no canto inferior direito

### 7.7 Relatórios
- 4 KPIs (Receita, ROAS, CAC, LTV/CAC) com delta + ícone arrow
- Gráfico de área (svg) com linha primary + glow + dots + grid dashed
- Funil de conversão: barras horizontais com gradient + glow, % entre etapas
- Tabela de performance por origem com ícone de canal colorido

### 7.8 Conexões
- Hero status banner com glow + 3 mini-stats (eventos 24h, latência, uptime)
- Filtros pill (Todas, Conectadas, Disponíveis, Em breve)
- Grid 3 col de cards de integração: ícone colorido em fundo `cor/22`, badge ativo/disponível, descrição, conta conectada em mono, botão Configurar/Conectar

---

## 8 · Padrões / regras visuais

1. **Dados em mono.** Todo número, métrica, score, timestamp, ID — sempre `font-mono`.
2. **Eyebrows.** Toda label de seção ou KPI usa `.rz-eyebrow` (mono 10px 0.14em uppercase text-subtle).
3. **Glow é signature.** Use em: botão primary, focus rings, dots ativos, linhas SVG, hero gradients. Não use em texto normal.
4. **Borders sutis.** `border-rz-border` (rgba 8%) é o default. `border-rz-border-active` só em hover/focus/selected.
5. **Hover de cards.** `hover:border-rz-border-active hover:-translate-y-px` — 1px de lift + cor da borda.
6. **Radial gradients de marca.** Em cards "hero" (Score IA, Sofia card, Conexão ativa): `radial-gradient(circle at 100% 0%, var(--rz-glow), transparent 60%)` como overlay.
7. **Sem emoji** salvo em quick-replies de chat. Tudo via lucide.
8. **Letter-spacing negativo** em tudo que é título (entre -0.005em e -0.04em proporcional ao tamanho).

---

## 9 · Estado / dados

As telas no protótipo usam dados mockados inline. Pra produção:

- **Pipeline:** state shape em `references/product-screens-1.jsx` linha 1-15 (`SAMPLE_LEADS`)
- **Inbox:** `references/product-screens-2.jsx` linha 3-15 (`CHATS`, `MESSAGES`)
- **Reports:** `references/product-screens-3.jsx` (`sources`, `funnel`, `series`)

Sugiro modelar como:
```ts
type Lead = { id: string; name: string; company: string; value: number;
              source: string; sourceIcon: IconName; createdAt: Date;
              score: number; hot: boolean; stage: "novo"|"qualif"|"neg"|"fechado" };
type Chat = { id: string; leadId: string; lastMessage: string;
              unread: number; online: boolean; agentActive: boolean };
```

---

## 10 · Arquivos do bundle

```
design_handoff_rezult_crm/
├── README.md                    ← este arquivo
├── tokens.css                   ← CSS vars (light + dark)
├── tailwind.config.ts           ← config completo
├── design-tokens.ts             ← tokens como objeto TS (pra JS)
├── lib/
│   └── utils.ts                 ← cn() + useTheme()
├── components/
│   ├── button.tsx               ← Button (5 variants × 4 sizes)
│   ├── badge.tsx                ← Badge (7 tones, dot)
│   ├── input.tsx                ← Input + Textarea
│   ├── card.tsx                 ← Card + MetricCard
│   ├── lead-card.tsx            ← Pipeline lead card
│   ├── logo.tsx                 ← 4 variantes do logo
│   └── icon.tsx                 ← Wrapper Lucide + brand SVGs + ICON_MAP
├── assets/
│   ├── logo-filled.svg          ← uso geral
│   ├── logo-outline.svg         ← hero / dark
│   ├── logo-glyph.svg           ← favicon, app icon
│   └── logo-wordmark.svg        ← footer, narrow
└── references/
    ├── Rezult CRM Brandbook.html         ← brandbook completo
    ├── Rezult CRM Product.html           ← protótipo navegável
    └── (arquivos JSX dos protótipos)
```

---

## 11 · Próximos passos sugeridos

1. Implementar shell + pipeline primeiro (cobre 80% dos padrões visuais)
2. Conectar a um backend mock (Supabase / tRPC / fake API)
3. Substituir mocks pelos dados reais conforme schema do CRM
4. Implementar drag-and-drop no Kanban com `@dnd-kit/core` (não tem nos protótipos)
5. Animações: respeite `--rz-ease` e durações; não invente novas curvas
