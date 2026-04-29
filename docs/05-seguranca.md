# Segurança — RLS e Storage

Todas as tabelas do schema `public` têm **RLS habilitado**. O princípio é que **cada usuário só acessa e modifica seus próprios dados** (`owner_id = auth.uid()` ou `id = auth.uid()` para profiles).

---

## Row Level Security por Tabela

### `public.profiles`

| Policy | Operação | Condição |
|---|---|---|
| `profiles: owner select` | SELECT | `auth.uid() = id` |
| `profiles: owner insert` | INSERT | `auth.uid() = id` |
| `profiles: owner update` | UPDATE | `auth.uid() = id` |

> ⚠️ Podem existir políticas duplicadas herdadas de duas migrations distintas. Funcionalmente corretas; podem ser consolidadas.

---

### `public.pipelines`

| Policy | Operação | Condição |
|---|---|---|
| `pipelines: ver próprios` | SELECT | `owner_id = auth.uid()` |
| `pipelines: criar próprios` | INSERT | `owner_id = auth.uid()` |
| `pipelines: editar próprios` | UPDATE | `owner_id = auth.uid()` |
| `pipelines: excluir próprios` | DELETE | `owner_id = auth.uid()` |

---

### `public.pipeline_columns`

As colunas não têm `owner_id` direto. A validação é feita via JOIN com `pipelines`:

| Policy | Operação | Condição |
|---|---|---|
| `pipeline_columns: ver via pipeline` | SELECT | `EXISTS (SELECT 1 FROM pipelines WHERE id = pipeline_id AND owner_id = auth.uid())` |
| `pipeline_columns: criar via pipeline` | INSERT | mesma lógica no `WITH CHECK` |
| `pipeline_columns: editar via pipeline` | UPDATE | mesma lógica no `USING` |
| `pipeline_columns: excluir via pipeline` | DELETE | mesma lógica no `USING` |

---

### `public.leads`

| Policy | Operação | Condição |
|---|---|---|
| `leads: ver próprios` | SELECT | `owner_id = auth.uid()` |
| `leads: criar próprios` | INSERT | `owner_id = auth.uid()` |
| `leads: editar próprios` | UPDATE | `owner_id = auth.uid()` |
| `leads: excluir próprios` | DELETE | `owner_id = auth.uid()` |

---

### `public.activities`

| Policy | Operação | Condição |
|---|---|---|
| `activities: ver próprias` | SELECT | `owner_id = auth.uid()` |
| `activities: criar próprias` | INSERT | `owner_id = auth.uid()` |
| `activities: editar próprias` | UPDATE | `owner_id = auth.uid()` |
| `activities: excluir próprias` | DELETE | `owner_id = auth.uid()` |

---

### `public.tasks`

| Policy | Operação | Condição |
|---|---|---|
| `tasks: ver próprias` | SELECT | `owner_id = auth.uid()` |
| `tasks: criar próprias` | INSERT | `owner_id = auth.uid()` |
| `tasks: editar próprias` | UPDATE | `owner_id = auth.uid()` |
| `tasks: excluir próprias` | DELETE | `owner_id = auth.uid()` |

---

### `public.products`

| Policy | Operação | Condição |
|---|---|---|
| `products: ver próprios` | SELECT | `owner_id = auth.uid()` |
| `products: criar próprios` | INSERT | `owner_id = auth.uid()` |
| `products: editar próprios` | UPDATE | `owner_id = auth.uid()` |
| `products: excluir próprios` | DELETE | `owner_id = auth.uid()` |

---

## Storage — Bucket `avatars`

| Propriedade | Valor |
|---|---|
| ID | `avatars` |
| Nome | `avatars` |
| Público | `true` (URLs acessíveis sem autenticação) |

**Estrutura de caminho:** `{user_id}/avatar.{ext}`

**Políticas em `storage.objects`:**

| Policy | Operação | Condição |
|---|---|---|
| `avatars: public read` | SELECT | `bucket_id = 'avatars'` — qualquer pessoa pode ler |
| `avatars: owner upload` | INSERT | `bucket_id = 'avatars' AND auth.uid()::text = storage.foldername(name)[1]` |
| `avatars: owner update` | UPDATE | mesma condição — só o dono pode substituir |
| `avatars: owner delete` | DELETE | mesma condição — só o dono pode excluir |

> `storage.foldername(name)[1]` retorna o primeiro segmento do path, que é sempre o `user_id`. Garante que cada usuário só escreve/deleta dentro de sua própria pasta.
