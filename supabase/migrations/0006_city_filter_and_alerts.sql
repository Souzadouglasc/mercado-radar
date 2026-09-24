-- MercadoRadar - Tarefa I2: Filtro por cidade + Alertas reais
-- 1. Atualiza RPC search_products_ft para aceitar p_city (filtro por cidade do mercado)
-- 2. Função helper para avaliar alertas após ingestão de preços

-- 1. RPC search_products_ft com filtro opcional de cidade
create or replace function search_products_ft(p_term text, p_limit int default 20, p_city text default null)
returns table (
  id uuid, name text, slug text, brand text,
  unit text, quantity numeric, image_url text, rank real
)
language sql stable security definer set search_path = public as $$
  with q as (select plainto_tsquery('portuguese', p_term) as tsq)
  (
    select p.id, p.name, p.slug, p.brand, p.unit, p.quantity, p.image_url,
      ts_rank(to_tsvector('portuguese', coalesce(p.name,'') || ' ' || coalesce(p.brand,'')), q.tsq) as rank
    from products p, q
    where p.active
      and to_tsvector('portuguese', coalesce(p.name,'') || ' ' || coalesce(p.brand,'')) @@ q.tsq
      and (p_city is null or exists (
        select 1 from prices pr
        join markets m on m.id = pr.market_id
        where pr.product_id = p.id
          and m.active
          and m.city = p_city
      ))
    order by rank desc, p.name
    limit p_limit
  )
  union
  (
    select p.id, p.name, p.slug, p.brand, p.unit, p.quantity, p.image_url, 0::real
    from products p
    where p.active
      and (p.name ilike '%' || p_term || '%' or coalesce(p.brand,'') ilike '%' || p_term || '%')
      and (p_city is null or exists (
        select 1 from prices pr
        join markets m on m.id = pr.market_id
        where pr.product_id = p.id
          and m.active
          and m.city = p_city
      ))
      and not exists (
        select 1 from products p2, q
        where p2.id = p.id and p2.active
          and to_tsvector('portuguese', coalesce(p2.name,'') || ' ' || coalesce(p2.brand,'')) @@ q.tsq
      )
    order by p.name
    limit p_limit
  )
  limit p_limit;
$$;

grant execute on function search_products_ft(text, int, text) to anon, authenticated;

-- 2. Função para avaliar alertas de preço e criar notificações em batch
-- Chama após upsert de preços em app/api/ingest/prices/route.ts
create or replace function evaluate_price_alerts(p_product_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_product_id uuid;
  v_alert record;
  v_latest_price record;
  v_prev_price record;
  v_min_price record;
  v_message text;
  v_alert_type text;
  v_notifications record[];
begin
  -- Para cada produto afetado, verifica alertas ativos
  for v_product_id in select unnest(p_product_ids) loop
    for v_alert in
      select * from price_alerts
      where product_id = v_product_id
        and active
    loop
      -- Busca último preço do produto (filtrado por mercado do alerta se houver)
      select p.price, p.promotional_price, p.market_id, p.collected_at, m.name as market_name
      into v_latest_price
      from prices p
      join markets m on m.id = p.market_id
      where p.product_id = v_product_id
        and (v_alert.market_id is null or p.market_id = v_alert.market_id)
        and m.active
      order by p.collected_at desc
      limit 1;

      if not found then
        continue; -- sem preço ainda
      end if;

      v_notifications := '{}';

      -- 1. target_price: preço ≤ alvo
      if v_alert.target_price is not null then
        if (v_latest_price.promotional_price ?? v_latest_price.price) <= v_alert.target_price then
          v_message := format(
            'Preço de %s em %s (%s) atingiu seu alvo de %s!',
            (select name from products where id = v_product_id),
            v_latest_price.market_name,
            to_char(v_latest_price.promotional_price ?? v_latest_price.price, 'FM999,999,990.00'),
            to_char(v_alert.target_price, 'FM999,999,990.00')
          );
          v_notifications := v_notifications || row(v_alert.user_id, v_alert.id, v_product_id, v_latest_price.market_id, 'target_price', v_message)::notifications[];
        end if;
      end if;

      -- 2. drop_percent: queda > X% vs penúltimo preço do mesmo mercado
      if v_alert.drop_percent is not null then
        select p.price, p.promotional_price, p.collected_at
        into v_prev_price
        from prices p
        where p.product_id = v_product_id
          and p.market_id = v_latest_price.market_id
        order by p.collected_at desc
        offset 1 limit 1;

        if found then
          const current_price := v_latest_price.promotional_price ?? v_latest_price.price;
          const prev_price := v_prev_price.promotional_price ?? v_prev_price.price;
          if prev_price > 0 and ((prev_price - current_price) / prev_price) * 100 > v_alert.drop_percent then
            v_message := format(
              'Preço de %s em %s caiu %.1f%% (era %s, agora %s)!',
              (select name from products where id = v_product_id),
              v_latest_price.market_name,
              ((prev_price - current_price) / prev_price) * 100,
              to_char(prev_price, 'FM999,999,990.00'),
              to_char(current_price, 'FM999,999,990.00')
            );
            v_notifications := v_notifications || row(v_alert.user_id, v_alert.id, v_product_id, v_latest_price.market_id, 'drop_percent', v_message)::notifications[];
          end if;
        end if;
      end if;

      -- 3. notify_lowest: novo preço < mínimo histórico do produto (mesmo mercado se alerta tem mercado, senão global)
      if v_alert.notify_lowest then
        select min(p.price) as min_price
        into v_min_price
        from prices p
        where p.product_id = v_product_id
          and (v_alert.market_id is null or p.market_id = v_alert.market_id);

        if found and v_min_price.min_price is not null then
          const current_price := v_latest_price.promotional_price ?? v_latest_price.price;
          if current_price < v_min_price.min_price then
            v_message := format(
              'Novo menor preço histórico de %s em %s: %s (era %s)!',
              (select name from products where id = v_product_id),
              v_latest_price.market_name,
              to_char(current_price, 'FM999,999,990.00'),
              to_char(v_min_price.min_price, 'FM999,999,990.00')
            );
            v_notifications := v_notifications || row(v_alert.user_id, v_alert.id, v_product_id, v_latest_price.market_id, 'notify_lowest', v_message)::notifications[];
          end if;
        end if;
      end if;

      -- Insere notificações em batch (evita duplicadas por alert_type+produto+mercado+user no mesmo dia?)
      if array_length(v_notifications, 1) > 0 then
        insert into notifications (user_id, alert_id, product_id, market_id, title, message)
        select n.user_id, n.alert_id, n.product_id, n.market_id,
          case n.alert_type
            when 'target_price' then 'Preço-alvo atingido'
            when 'drop_percent' then 'Queda de preço detectada'
            when 'notify_lowest' then 'Novo mínimo histórico'
          end,
          n.message
        from unnest(v_notifications) as n(user_id, alert_id, product_id, market_id, alert_type, message)
        -- Evita notificação duplicada do mesmo tipo para o mesmo produto/mercado/usuário nas últimas 24h
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

grant execute on function evaluate_price_alerts(uuid[]) to service_role;