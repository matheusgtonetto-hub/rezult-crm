ALTER TABLE google_oauth_tokens
ADD CONSTRAINT google_oauth_tokens_user_id_key UNIQUE (user_id);
