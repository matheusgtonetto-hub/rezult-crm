-- =============================================================
-- contacts precisa estar na publicação de realtime: upsertContact
-- (src/lib/contacts.ts) escreve direto no Supabase sem passar pelo
-- setContacts do CRMContext -- é o listener realtime que reflete a
-- criação/edição na UI (ver CRMContext.tsx, canal leads-rt-*).
-- =============================================================

alter publication supabase_realtime add table public.contacts;
