-- Função auxiliar para salvar token Google, contornando o cache de schema do PostgREST.
-- Chamada via rpc() nas Edge Functions para evitar PGRST204.
create or replace function public.upsert_google_token(
  p_user_id       uuid,
  p_company_id    uuid,
  p_access_token  text,
  p_refresh_token text,
  p_token_expiry  timestamptz,
  p_email         text,
  p_scopes        text[],
  p_updated_at    timestamptz
) returns void
language plpgsql
security definer
as $$
begin
  delete from public.google_oauth_tokens
  where user_id = p_user_id
    and (
      (p_company_id is not null and company_id = p_company_id)
      or
      (p_company_id is null and company_id is null)
    );

  insert into public.google_oauth_tokens
    (user_id, company_id, access_token, refresh_token, token_expiry, email, scopes, updated_at)
  values
    (p_user_id, p_company_id, p_access_token, p_refresh_token, p_token_expiry, p_email, p_scopes, p_updated_at);
end;
$$;
