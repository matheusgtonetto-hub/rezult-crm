# Visão Geral e Arquitetura

**Rezult CRM** é uma aplicação web de gestão de relacionamento com clientes voltada para equipes comerciais brasileiras. Permite gerenciar leads, pipelines de venda em formato Kanban, tarefas, atividades e perfil do usuário, com dados isolados por usuário autenticado via Supabase Auth.

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18.3 + TypeScript + Vite 5.4 |
| UI | Shadcn UI (Radix primitives) + Tailwind CSS 3.4 |
| Backend / DB | Supabase (PostgreSQL 17) |
| Autenticação | Supabase Auth (email/password) |
| Storage | Supabase Storage |
| Drag & Drop | Hello Pangea DnD 18 |
| Formulários | React Hook Form 7 + Zod 3 |
| Roteamento | React Router 6 |
| Notificações | Sonner 1.7 |
| Gráficos | Recharts 2.15 |
| Integrações externas | ViaCEP API · WhatsApp (wa.me) |

## Estrutura de Diretórios

```
src/
├── App.tsx                        # Roteamento raiz + providers
├── main.tsx                       # Entry point React
│
├── context/
│   ├── AuthContext.tsx            # Sessão Supabase, signIn/signUp/signOut
│   ├── CRMContext.tsx             # Estado global de leads, pipelines, tarefas
│   ├── ProfileContext.tsx         # Perfil do usuário logado (leitura/escrita)
│   └── FloatingChatContext.tsx    # Janelas de chat flutuantes
│
├── components/
│   ├── AppSidebar.tsx             # Navegação lateral fixa (52px)
│   ├── AppLayout.tsx              # Wrapper de layout com sidebar
│   ├── LeadModal.tsx              # Modal 4-abas de criação/edição de lead
│   ├── LeadDrawer.tsx             # Drawer lateral de detalhes do lead
│   ├── PipelineSidebar.tsx        # Seletor de pipeline
│   ├── FloatingChatManager.tsx    # Gerenciador de chats flutuantes
│   └── ui/                        # Componentes Shadcn (button, input, dialog…)
│
├── pages/
│   ├── LoginPage.tsx              # Login / Cadastro / Confirmação de e-mail
│   ├── DashboardPage.tsx          # Painel analítico
│   ├── PipelinePage.tsx           # Kanban de pipeline
│   ├── LeadsPage.tsx              # Tabela de leads + ações
│   ├── LeadDetailPage.tsx         # Detalhe individual do lead
│   ├── SettingsPage.tsx           # Configurações (14 seções)
│   └── [outras páginas em desenvolvimento]
│
├── data/
│   └── mockData.ts                # Interfaces TypeScript + availableTags
│
└── lib/
    ├── supabase.ts                # Cliente Supabase singleton
    └── utils.ts                   # Utilitários (cn, etc.)
```

## Hierarquia de Providers

```
QueryClientProvider
  └── TooltipProvider
        └── BrowserRouter
              └── AuthProvider
                    └── ProfileProvider          ← dados de perfil
                          └── CRMProvider        ← leads, pipelines, tarefas
                                └── FloatingChatProvider
                                      └── <Routes />
```
