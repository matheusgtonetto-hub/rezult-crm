# Edge Functions e Integrações Externas

## Edge Functions Supabase

Atualmente **não há Edge Functions** deployadas no projeto. Toda a lógica de negócio reside no frontend (React) com acesso direto ao banco via `supabase-js`.

---

## ViaCEP

Auto-preenchimento de endereço a partir do CEP.

| Atributo | Valor |
|---|---|
| URL | `https://viacep.com.br/ws/{cep}/json/` |
| Método | GET |
| Trigger | Campo CEP com 8 dígitos no `LeadModal` (aba Endereço) |
| Parâmetros | `{cep}` — 8 dígitos numéricos, sem formatação |
| Retorno em sucesso | `{ logradouro, bairro, localidade, uf, ... }` |
| Retorno em erro | `{ erro: true }` |
| Campos preenchidos | `address` (logradouro), `neighborhood` (bairro), `city` (localidade), `state` (uf) |

```typescript
// LeadModal.tsx
const fetchCep = async (raw: string) => {
  const cep = raw.replace(/\D/g, "");
  if (cep.length !== 8) return;
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  const data = await res.json();
  if (!data.erro) {
    setForm(p => ({
      ...p,
      address:      data.logradouro ?? p.address,
      neighborhood: data.bairro     ?? p.neighborhood,
      city:         data.localidade ?? p.city,
      state:        data.uf         ?? p.state,
    }));
  }
};
```

---

## WhatsApp (wa.me)

Abertura de conversa direta no WhatsApp.

| Atributo | Valor |
|---|---|
| URL | `https://wa.me/{DDI_sem_+}{número_sem_formatação}` |
| Trigger | Botão "Abrir Chat" no menu `...` de cada lead |
| Comportamento | `window.open(url, "_blank", "noopener")` |

```typescript
// LeadsPage.tsx
const openWhatsApp = (lead: Lead) => {
  const number = (lead.phoneDdi ?? "+55").replace("+", "")
    + lead.whatsapp.replace(/\D/g, "");
  window.open(`https://wa.me/${number}`, "_blank", "noopener");
};
```
