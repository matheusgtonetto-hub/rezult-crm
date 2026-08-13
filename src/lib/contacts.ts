import { supabase } from "@/lib/supabase";
import { normalizarTelefoneBr } from "@/lib/telefone";

export type Contact = {
  id: string;
  companyId: string;
  ownerId: string;
  name: string;
  phone?: string;
  phoneDdi?: string;
  email?: string;
  tags?: string[];
  site?: string;
  document?: string;
  company?: string;
  origin?: string;
  birthDate?: string;
  country?: string;
  zipCode?: string;
  address?: string;
  addrNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
  createdAt?: string;
};

export type UpsertContactInput = {
  companyId: string;
  ownerId: string;
  name: string;
  phone?: string;
  phoneDdi?: string;
  email?: string;
  tags?: string[];
  site?: string;
  document?: string;
  company?: string;
  origin?: string;
  birthDate?: string;
  country?: string;
  zipCode?: string;
  address?: string;
  addrNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
};

// Mapa campo do input -> coluna da tabela. Usado tanto pro insert (linha
// completa) quanto pro update (só os campos que o chamador de fato passou —
// ver providedFields).
const FIELD_MAP: [keyof UpsertContactInput, string][] = [
  ["phone", "phone"],
  ["phoneDdi", "phone_ddi"],
  ["email", "email"],
  ["tags", "tags"],
  ["site", "site"],
  ["document", "document"],
  ["company", "company"],
  ["origin", "origin"],
  ["birthDate", "birth_date"],
  ["country", "country"],
  ["zipCode", "zip_code"],
  ["address", "address"],
  ["addrNumber", "addr_number"],
  ["complement", "complement"],
  ["neighborhood", "neighborhood"],
  ["city", "city"],
  ["state", "state"],
  ["notes", "notes"],
];

function fieldValue(input: UpsertContactInput, key: keyof UpsertContactInput): unknown {
  const v = input[key];
  if (key === "tags") return (v as string[] | undefined)?.length ? v : null;
  return (v as string | undefined) || null;
}

function toRow(input: UpsertContactInput) {
  const row: Record<string, unknown> = {
    company_id: input.companyId,
    owner_id: input.ownerId,
    name: input.name,
  };
  for (const [key, column] of FIELD_MAP) row[column] = fieldValue(input, key);
  return row;
}

/**
 * Cria ou reaproveita um contato pelo telefone normalizado (dedup real via
 * uq_contacts_company_phone_norm). Em caso de match, faz update SÓ dos campos
 * que o chamador de fato passou (ex.: ensureContactForConversation só passa
 * name+phone — não pode apagar endereço/documento/tags já preenchidos por um
 * "Novo Lead" anterior). Dentro desses campos passados, name/email só são
 * sobrescritos se o valor existente estiver vazio (não apaga uma correção
 * manual anterior); os demais campos passados sempre são gravados como
 * enviados, já que refletem uma edição explícita do formulário.
 */
export async function upsertContact(input: UpsertContactInput): Promise<string | undefined> {
  const phoneNormalized = input.phone ? normalizarTelefoneBr(input.phone) : "";

  if (phoneNormalized) {
    const { data: found } = await supabase.from("contacts")
      .select("id, name, email")
      .eq("company_id", input.companyId)
      .eq("phone_normalized", phoneNormalized)
      .maybeSingle();

    if (found) {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined && !found.name) patch.name = input.name;
      for (const [key, column] of FIELD_MAP) {
        if (input[key] === undefined) continue; // não fornecido: não mexe
        if (column === "email" && found.email) continue; // não sobrescreve e-mail já preenchido
        patch[column] = fieldValue(input, key);
      }
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
    // corrida: outro insert venceu — reaproveita a linha existente em vez de duplicar
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
