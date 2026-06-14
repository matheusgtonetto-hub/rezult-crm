-- Renomeia as chaves internas dos planos: starter→silver, essential→platinum, pro→emerald
-- Atualiza companies.plan e subscriptions.plan_name para todos os registros existentes

update companies
set plan = case plan
  when 'starter'   then 'silver'
  when 'essential' then 'platinum'
  when 'pro'       then 'emerald'
  else plan
end
where plan in ('starter', 'essential', 'pro');

update subscriptions
set plan_name = case plan_name
  when 'starter'   then 'silver'
  when 'essential' then 'platinum'
  when 'pro'       then 'emerald'
  else plan_name
end
where plan_name in ('starter', 'essential', 'pro');
