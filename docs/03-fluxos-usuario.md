# Fluxos de Usuário

## Fluxo 1 — Primeiro Acesso (Cadastro)

```
[Usuário acessa /]
  → Redireciona para /login
  → Clica em "Criar uma conta"
  → Preenche e-mail + senha + confirmação
  → Frontend valida (mín. 6 chars, senhas iguais)
  → supabase.auth.signUp() é chamado
  → AuthContext cria registro em public.profiles (upsert)
  → Supabase envia e-mail de confirmação
  → Frontend exibe tela "Confirme seu e-mail"
  → Usuário clica no link do e-mail
  → onAuthStateChange dispara com session válida
  → App redireciona para /dashboard
  → ProfileContext carrega o perfil do banco
  → CRMContext carrega pipelines, leads, tarefas
```

---

## Fluxo 2 — Criação de Lead

```
[Usuário está em /leads]
  → Clica em "+ Novo Lead" (canto superior direito)
  → LeadModal abre na aba "Contato"
  → Preenche Nome (obrigatório) + Tags
  → Navega para aba "Contato": Telefone (DDI + número), E-mail, Site
  → Navega para aba "Dados Pessoais": Documento, Empresa, Origem, Nascimento
  → Navega para aba "Endereço": digita CEP
      → ViaCEP API é consultada automaticamente (ao digitar 8 dígitos)
      → Endereço, bairro, cidade e UF são preenchidos automaticamente
      → Usuário confirma/complementa dados
  → Navega para aba "Anotações": texto livre
  → Clica em "Criar Lead"
  → CRMContext.addLead() é chamado
      → INSERT em public.leads com owner_id = auth.uid()
      → INSERT em public.activities (tipo "created")
      → Estado local atualizado (setLeads + setPipelines)
  → Toast "Lead criado!" exibido
  → Modal fecha
  → Lead aparece na tabela de /leads
```

---

## Fluxo 3 — Mover Lead no Kanban

```
[Usuário está em /pipeline]
  → Arrasta card de um lead de uma coluna para outra
  → DragDropContext.onDragEnd dispara
  → CRMContext.moveLead(leadId, fromCol, toCol, toIndex) é chamado
      → Estado local de pipelines atualizado otimisticamente
      → UPDATE leads SET column_id = toCol WHERE id = leadId
  → Card aparece na nova coluna instantaneamente
```

---

## Fluxo 4 — Atualização de Foto de Perfil

```
[Usuário em /configuracoes → Meu Perfil]
  → Clica na área de upload "Escolher arquivo"
  → Seletor de arquivo abre (aceita image/*)
  → Frontend valida tamanho (≤ 2MB)
  → ProfileContext.uploadAvatar(file) é chamado
      → supabase.storage.from("avatars").upload("{uid}/avatar.{ext}", file, { upsert: true })
      → Obtém URL pública via getPublicUrl()
      → UPDATE profiles SET avatar_url = url WHERE id = uid
      → setProfile(updated) atualiza estado global
  → Sidebar e painel de perfil exibem nova foto imediatamente
```

---

## Fluxo 5 — Criar Negócio a partir de Lead

```
[Usuário em /leads → menu "..." de um lead → "Criar negócio"]
  → Dialog "Criar negócio" abre
  → Usuário seleciona Pipeline (dropdown) + Etapa (dropdown)
  → Clica em "Criar negócio"
  → CRMContext.addLead() chamado com dados do lead original
      → Novo deal_number gerado (nextDealNumber())
      → pipeline_id e stage (column_id) = selecionados pelo usuário
      → INSERT em public.leads
      → INSERT em public.activities (tipo "created")
  → Toast "Negócio criado!" exibido
  → Lead aparece na coluna selecionada do pipeline
```
