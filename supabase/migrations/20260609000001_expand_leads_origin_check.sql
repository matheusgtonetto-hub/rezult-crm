-- Alinha a constraint leads_origin_check ao tipo LeadOrigin (src/data/mockData.ts)
-- e aos dropdowns da UI (LeadDrawer, LeadDetailPage, AutomacoesPage).
-- Antes só aceitava 5 valores ("Instagram","Facebook Ads","Indicação","Site","Outro"),
-- enquanto o app já oferecia 14 — fazer save com "Google Ads"/"Meta Ads"/etc. falhava
-- com violação de check constraint (inclusive via automações).

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_origin_check;

ALTER TABLE leads ADD CONSTRAINT leads_origin_check CHECK (
  origin = ANY (ARRAY[
    'Instagram',
    'Facebook Ads',
    'Google Ads',
    'Meta Ads',
    'TikTok Ads',
    'LinkedIn Ads',
    'YouTube Ads',
    'Email Marketing',
    'Orgânico',
    'WhatsApp',
    'Evento',
    'Indicação',
    'Site',
    'Outro'
  ]::text[])
);
