-- MercadoRadar - Migration 0009: Alerts Evolution + Dynamic Scrape Actions
-- 1. price_alerts: adiciona colunas para regras avançadas (target_price OR drop_percent OR notify_lowest)
-- 2. scrape_actions: tabela dinâmica de ações de scraping (substitui .github/workflows/scrape-all.yml matrix)

-- 1. Evolução de price_alerts
alter table price_alerts
  add column if not exists rule_type text
    check (rule_type in ('target_price','drop_percent','notify_lowest'))
    default 'target_price';

-- Se notify_lowest = true, ignora target_price e drop_percent
alter table price_alerts
  add column if not exists check_interval_hours int default 24 check (check_interval_hours > 0);

-- Última verificação para throttling
alter table price_alerts
  add column if not exists last_checked_at timestamptz;

-- 2. Tabela dinâmica de ações de scraping
create table if not exists scrape_actions (
  id uuid primary key default gen_random_uuid(),
  market_slug text not null references markets(slug) on delete cascade,
  action_type text not null check (action_type in ('full','incremental','single_url')),
  status text not null check (status in ('pending','running','done','failed')) default 'pending',
  priority int not null default 0,          -- maior = executa primeiro
  params jsonb not null default '{}',       -- {limit, skip, concurrency, throttleMs, urls: string[]}
  started_at timestamptz,
  finished_at timestamptz,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scrape_actions_status_priority_idx
  on scrape_actions (status, priority desc, created_at);

create index if not exists scrape_actions_market_slug_idx
  on scrape_actions (market_slug);

-- Trigger updated_at
create trigger scrape_actions_updated_at before update on scrape_actions
  for each row execute function set_updated_at();

-- RLS
alter table scrape_actions enable row level security;
create policy "scrape_actions admin" on scrape_actions for all using (is_admin()) with check (is_admin());

grant select on scrape_actions to anon, authenticated;

-- Seed: actions padrão para mercados ativos (executadas pelo cron runner)
insert into scrape_actions (market_slug, action_type, status, priority, params)
select m.slug, 'incremental', 'pending', 10, jsonb_build_object(
  'limit', 200, 'concurrency', 4, 'throttleMs', 2000
)
from markets m
where m.active
on conflict do nothing;

-- RPC: get_next_scrape_action (pega próxima ação pendente com maior prioridade)
create or replace function get_next_scrape_action()
returns setof scrape_actions
language plpgsql security definer set search_path = public as $$
declare
  v_action scrape_actions%rowtype;
begin
  -- Lock para evitar race conditions entre workers
  for v_action in
    select * from scrape_actions
    where status = 'pending'
    order by priority desc, created_at
    for update skip locked
    limit 1
  loop
    update scrape_actions
    set status = 'running', started_at = now()
    where id = v_action.id;
    return next v_action;
  end loop;
end $$;

-- RPC: complete_scrape_action
create or replace function complete_scrape_action(
  p_action_id uuid,
  p_status text,           -- 'done' | 'failed'
  p_error_summary text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update scrape_actions
  set status = p_status,
      finished_at = now(),
      error_summary = p_error_summary,
      updated_at = now()
  where id = p_action_id;
end $$;

grant execute on function get_next_scrape_action() to authenticated;
grant execute on function complete_scrape_action(uuid, text, text) to authenticated;