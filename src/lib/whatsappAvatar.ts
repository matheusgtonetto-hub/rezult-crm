import { somenteDigitos, normalizarTelefoneBr } from "@/lib/telefone";

// Busca a foto de perfil do WhatsApp de um número via D-API/Z-API. Extraído
// de LeadDetailPage.tsx pra ser reaproveitado também no board do Pipeline
// (mesmo endpoint/lógica que MultiatendimentoPage já usa há mais tempo, mas
// com o próprio cache/loop de retry de cada página, não compartilhado aqui).
export interface WaAvatarCreds {
  provider?: string;
  instanceId: string;
  token: string;
  clientToken?: string | null;
}

// Cloud API (WhatsApp Business oficial da Meta) não expõe foto de perfil de
// contato nenhum -- restrição da própria plataforma, nunca tenta.
export async function fetchWhatsappAvatar(phone: string, inst: WaAvatarCreds, force = false): Promise<string | undefined> {
  const p = somenteDigitos(phone);
  if (!p || inst.provider === "cloud_api") return undefined;
  // Número curto demais não é telefone de ninguém: é lead de teste, rascunho ou
  // digitação incompleta. A base tem uma conversa chamada "999", e pedir avatar
  // dela fazia a D-API devolver 520 -- que, sendo página de erro, vem sem
  // cabeçalho CORS e o navegador relata como bloqueio de origem. Erro vermelho
  // no console, causa nenhuma óbvia, e nada a corrigir do outro lado.
  //
  // Mesma guarda de 10 dígitos de telefonesIguais(): abaixo disso a gente não
  // afirma nada sobre o número, então também não pergunta.
  if (normalizarTelefoneBr(p).length < 10) return undefined;
  try {
    const res = inst.provider === "dapi"
      ? await fetch(
          `https://api.d-api.cloud/api/v1/contacts/${p}/avatar?sessionId=${inst.instanceId}${force ? "&force=true" : ""}`,
          { headers: { "Authorization": inst.token } }
        )
      : await fetch(
          `https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/profile-picture?phone=${p}`,
          { headers: { "Client-Token": inst.clientToken ?? "" } }
        );
    if (!res.ok) return undefined;
    const json = await res.json() as Record<string, unknown>;
    const body = (json.data ?? json) as Record<string, unknown>;
    return (body.link ?? body.value ?? body.profilePicture ?? body.imgUrl ?? body.url ?? body.avatarUrl ?? body.picture ?? body.avatar) as string | undefined;
  } catch {
    return undefined;
  }
}
