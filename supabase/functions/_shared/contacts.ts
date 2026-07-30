// Duplicata Deno de src/lib/contacts.ts::upsertContact — edge functions não
// importam de src/. Mesma lógica: dedup por telefone normalizado
// (contacts.phone_normalized, índice único uq_contacts_company_phone_norm),
// update só preenche name/email se o existente estiver vazio, insert com
// retry em caso de corrida (23505). Usado por leads-webhook e
// automation-runner (nó criar_lead / criar_negocio) pra garantir que todo
// negócio criado no servidor também fique ligado a um contacts.id via
// leads.person_id.

function normalizeBrPhone(raw: string | undefined | null): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}

export type UpsertContactInput = {
  companyId: string;
  ownerId: string;
  name: string;
  phone?: string | null;
  phoneDdi?: string | null;
  email?: string | null;
};

function toRow(input: UpsertContactInput) {
  return {
    company_id: input.companyId,
    owner_id: input.ownerId,
    name: input.name,
    phone: input.phone || null,
    phone_ddi: input.phoneDdi || null,
    email: input.email || null,
  };
}

// deno-lint-ignore no-explicit-any
export async function upsertContact(supabase: any, input: UpsertContactInput): Promise<string | undefined> {
  const phoneNormalized = input.phone ? normalizeBrPhone(input.phone) : "";

  if (phoneNormalized) {
    const { data: found } = await supabase.from("contacts")
      .select("id, name, email")
      .eq("company_id", input.companyId)
      .eq("phone_normalized", phoneNormalized)
      .maybeSingle();

    if (found) {
      // deno-lint-ignore no-explicit-any
      const patch: Record<string, any> = {};
      if (!found.name && input.name) patch.name = input.name;
      if (!found.email && input.email) patch.email = input.email;
      if (Object.keys(patch).length > 0) {
        await supabase.from("contacts").update(patch).eq("id", found.id);
      }
      return found.id;
    }
  }

  const { data: created, error } = await supabase.from("contacts")
    .insert(toRow(input))
    .select("id").single();

  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("contacts")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("phone_normalized", phoneNormalized)
      .maybeSingle();
    return existing?.id;
  }
  if (error || !created) {
    console.error("upsertContact:", error);
    return undefined;
  }
  return created.id;
}
