ALTER TABLE whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_company_instance_unique
  UNIQUE (company_id, instance_id);
