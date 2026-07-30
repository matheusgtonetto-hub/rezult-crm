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
  const p = phone.replace(/\D/g, "");
  if (!p || inst.provider === "cloud_api") return undefined;
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
