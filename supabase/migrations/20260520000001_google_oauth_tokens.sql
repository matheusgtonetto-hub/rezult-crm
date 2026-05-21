create table if not exists public.google_oauth_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  token_expiry  timestamptz,
  email         text,
  scopes        text[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists google_oauth_tokens_user_id_idx
  on public.google_oauth_tokens(user_id);

alter table public.google_oauth_tokens enable row level security;

create policy "Usuário acessa apenas seus próprios tokens"
  on public.google_oauth_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
