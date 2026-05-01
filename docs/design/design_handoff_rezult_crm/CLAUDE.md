# Rezult CRM — Regras de Design

> Este arquivo é instrução persistente pro Claude Code. Carrega em toda sessão. **Sempre respeite estas regras ao escrever ou revisar UI.**

## Stack
- **React + TypeScript + Tailwind + shadcn/ui**
- **lucide-react** pra ícones (use o wrapper `@/components/ui/icon` quando existir)
- **Geist** + **Geist Mono** (importadas em `tokens.css`)
- Theme switching via `data-theme="dark|light"` + `class="dark"` no `<html>`

## Direção visual (não-negociável)
**Moderno · neon · técnico · outline.** Verde neon `#00E599` como cor de marca em dark, esmeralda `#00C77F` em light. Tipografia Geist com letter-spacing negativo em títulos. Glow signature em superfícies primárias.

## Cores — sempre via tokens
**NUNCA** use cores hex inline. Sempre via classes Tailwind ou CSS vars:
- Fundos: `bg-rz-bg` `bg-rz-surface` `bg-rz-surface-2` `bg-rz-surface-3`
- Texto: `text-rz-text` `text-rz-text-muted` `text-rz-text-subtle`
- Bordas: `border-rz-border` `border-rz-border-active`
- Marca: `bg-rz-primary` `text-rz-primary` `text-rz-on-primary`
- Semânticos: `text-rz-success` `text-rz-warning` `text-rz-danger` `text-rz-info` `text-rz-purple`

Se precisar de uma cor que não existe nos tokens, **pergunte antes de inventar** — provavelmente tem um token equivalente.

## Tipografia
- Sans (`font-sans` = Geist) pra todo texto humano
- **Mono (`font-mono` = Geist Mono) OBRIGATÓRIO em:** números, métricas, scores, timestamps, IDs, eyebrows, valores monetários em destaque
- Eyebrows = `font-mono text-[10px] tracking-[0.14em] uppercase text-rz-text-subtle` (use `.rz-eyebrow` se preferir)
- Títulos sempre com letter-spacing negativo (`tracking-tight`, `tracking-[-0.02em]`, `tracking-[-0.025em]`, etc.)

## Componentes
Use os do `components/ui/` (Button, Badge, Input, Textarea, Card, MetricCard, LeadCard). **Não duplique** — se faltar variant, **adicione ao componente existente** em vez de criar um novo. Pergunte antes de criar componente novo.

## Glow signature
Use `shadow-rz-glow` (= `0 0 24px var(--rz-glow)`) em:
- Botão primary
- Focus rings de inputs (já está no Input)
- Dots ativos / online
- Linhas de SVG em destaque (chart, automation edges)
- Borders de cards "hero" (Score IA, Sofia card, conexão ativa)

**NÃO use glow em:** texto normal, ícones genéricos, cards padrão.

## Espaçamento
Base 4px. Use a escala: `1 (4) · 2 (8) · 3 (12) · 4 (16) · 5 (20) · 6 (24) · 8 (32) · 10 (40) · 12 (48) · 16 (64)`. Nunca valores arbitrários como `p-[13px]`.

## Radius
- Inputs / pills / botões pequenos: `rounded-md` (10px)
- Cards / painéis: `rounded-lg` (16px)
- Avatares quadrados / chips internos: `rounded-sm` (6px)
- Badges, tags pill: `rounded-full`

## Hover / focus
- Cards clicáveis: `hover:border-rz-border-active hover:-translate-y-px transition-all duration-[120ms] ease-rz`
- Botões primary: já tem hover via `buttonVariants`
- Focus em inputs: já tem ring glow no componente

## Motion
- Easing único: `ease-rz` (= `cubic-bezier(0.2, 0.8, 0.2, 1)`)
- Durações: 120ms (micro), 200ms (default), 400ms (transições maiores)
- **Não invente curvas novas.**

## Ícones
- Sempre use `<Icon name="..." />` do `components/ui/icon`
- Tamanhos: 12 (inline com texto pequeno), 14 (default em UI), 16-18 (botões), 22+ (hero)
- Stroke 1.75 é o default — não mudar sem motivo

## Anti-padrões (NÃO FAZER)
- ❌ Cores hex inline em JSX (`style={{ color: '#00E599' }}`)
- ❌ Emoji em UI (salvo em quick-replies de chat)
- ❌ Drop shadows pesadas estilo material (use `shadow-rz-md` no máx)
- ❌ Gradientes de fundo em página inteira (gradients são pontuais — em cards hero, em botões primary nem isso)
- ❌ Border-radius diferentes em componentes irmãos
- ❌ Texto em sans onde deveria ser mono (números, IDs)
- ❌ Inventar ícones em SVG inline quando lucide tem equivalente
- ❌ Criar variants novos em componentes existentes sem confirmar

## Referência visual
Sempre que tiver dúvida sobre como algo deve parecer, abra:
- `design_handoff_rezult_crm/references/Rezult CRM Brandbook.html` — sistema completo
- `design_handoff_rezult_crm/references/Rezult CRM Product.html` — telas reais

E os JSX em `references/product-screens-*.jsx` mostram o markup exato (em React não-Tailwind, mas a estrutura serve).

## Quando estiver na dúvida
- Pergunte ao usuário antes de adicionar conteúdo, copy ou seções novas
- Pergunte antes de criar variantes ou componentes novos
- Prefira menos UI a mais — densidade vem de tipografia e mono, não de bordas e shadows
