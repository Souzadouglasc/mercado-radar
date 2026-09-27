-- Supabase advisor remediations for MercadoRadar.
-- Preserve public catalog reads and authenticated admin writes while reducing
-- exposed SECURITY DEFINER code and adding indexes for foreign-key lookups.

ALTER VIEW public.latest_prices SET (security_invoker = true);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.is_admin() SET SCHEMA private;
ALTER FUNCTION private.is_admin() SET search_path = pg_catalog, public, auth;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated, service_role;

ALTER FUNCTION public.handle_new_user() SET SCHEMA private;
ALTER FUNCTION private.handle_new_user() SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog;

CREATE OR REPLACE FUNCTION public.latest_prices_for_products(p_ids uuid[])
RETURNS TABLE(
  product_id uuid,
  market_id uuid,
  price numeric,
  promotional_price numeric,
  collected_at timestamptz,
  market_name text,
  market_slug text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT DISTINCT ON (p.product_id, p.market_id)
    p.product_id, p.market_id, p.price, p.promotional_price, p.collected_at,
    m.name, m.slug
  FROM public.prices AS p
  JOIN public.markets AS m ON m.id = p.market_id
  WHERE p.product_id = ANY (p_ids)
  ORDER BY p.product_id, p.market_id, p.collected_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.search_products_ft(p_term text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, name text, slug text, brand text, unit text, quantity numeric, image_url text, rank real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  WITH q AS (SELECT plainto_tsquery('portuguese', p_term) AS tsq)
  (
    SELECT p.id, p.name, p.slug, p.brand, p.unit, p.quantity, p.image_url,
      ts_rank(to_tsvector('portuguese', coalesce(p.name, '') || ' ' || coalesce(p.brand, '')), q.tsq) AS rank
    FROM public.products AS p, q
    WHERE p.active
      AND to_tsvector('portuguese', coalesce(p.name, '') || ' ' || coalesce(p.brand, '')) @@ q.tsq
    ORDER BY rank DESC, p.name
    LIMIT p_limit
  )
  UNION
  (
    SELECT p.id, p.name, p.slug, p.brand, p.unit, p.quantity, p.image_url, 0::real
    FROM public.products AS p
    WHERE p.active
      AND (p.name ILIKE '%' || p_term || '%' OR coalesce(p.brand, '') ILIKE '%' || p_term || '%')
      AND NOT EXISTS (
        SELECT 1
        FROM public.products AS p2, q
        WHERE p2.id = p.id
          AND p2.active
          AND to_tsvector('portuguese', coalesce(p2.name, '') || ' ' || coalesce(p2.brand, '')) @@ q.tsq
      )
    ORDER BY p.name
    LIMIT p_limit
  )
  LIMIT p_limit;
$function$;

REVOKE ALL ON FUNCTION public.complete_scrape_action(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_scrape_action(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_next_scrape_action() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_scrape_action() TO service_role;
REVOKE ALL ON FUNCTION public.upsert_canonical_product(text, text, text, text, text, text, numeric, text, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_canonical_product(text, text, text, text, text, text, numeric, text, numeric, text, text, text) TO service_role;

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- User-owned data policies: cache auth.uid() once per statement and scope to authenticated.
DROP POLICY IF EXISTS "proprio usuario" ON public.shopping_lists;
CREATE POLICY "proprio usuario" ON public.shopping_lists
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "proprio usuario" ON public.favorites;
CREATE POLICY "proprio usuario" ON public.favorites
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "proprio usuario" ON public.price_alerts;
CREATE POLICY "proprio usuario" ON public.price_alerts
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "proprio usuario" ON public.notifications;
CREATE POLICY "proprio usuario" ON public.notifications
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "itens da propria lista" ON public.shopping_list_items;
CREATE POLICY "itens da propria lista" ON public.shopping_list_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shopping_lists AS l
      WHERE l.id = shopping_list_items.list_id
        AND l.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.shopping_lists AS l
      WHERE l.id = shopping_list_items.list_id
        AND l.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "atualiza proprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "proprio perfil" ON public.profiles;
CREATE POLICY "proprio perfil" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id OR (SELECT private.is_admin()));
CREATE POLICY "atualiza proprio perfil" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Restrict admin policies to signed-in roles and separate writes from SELECT.
DROP POLICY IF EXISTS "canonical escrita admin" ON public.canonical_products;
CREATE POLICY "canonical escrita admin insert" ON public.canonical_products FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "canonical escrita admin update" ON public.canonical_products FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "canonical escrita admin delete" ON public.canonical_products FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "catalogo escrita admin" ON public.categories;
CREATE POLICY "categories escrita admin insert" ON public.categories FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "categories escrita admin update" ON public.categories FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "categories escrita admin delete" ON public.categories FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "template_items escrita admin" ON public.list_template_items;
CREATE POLICY "template_items escrita admin insert" ON public.list_template_items FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "template_items escrita admin update" ON public.list_template_items FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "template_items escrita admin delete" ON public.list_template_items FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "templates escrita admin" ON public.list_templates;
CREATE POLICY "templates escrita admin insert" ON public.list_templates FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "templates escrita admin update" ON public.list_templates FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "templates escrita admin delete" ON public.list_templates FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "catalogo escrita admin" ON public.markets;
CREATE POLICY "markets escrita admin insert" ON public.markets FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "markets escrita admin update" ON public.markets FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "markets escrita admin delete" ON public.markets FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "catalogo escrita admin" ON public.price_sources;
CREATE POLICY "price_sources escrita admin insert" ON public.price_sources FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "price_sources escrita admin update" ON public.price_sources FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "price_sources escrita admin delete" ON public.price_sources FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "catalogo escrita admin" ON public.prices;
CREATE POLICY "prices escrita admin insert" ON public.prices FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "prices escrita admin update" ON public.prices FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "prices escrita admin delete" ON public.prices FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "catalogo escrita admin" ON public.product_aliases;
CREATE POLICY "product_aliases escrita admin insert" ON public.product_aliases FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "product_aliases escrita admin update" ON public.product_aliases FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "product_aliases escrita admin delete" ON public.product_aliases FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "catalogo escrita admin" ON public.products;
CREATE POLICY "products escrita admin insert" ON public.products FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "products escrita admin update" ON public.products FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "products escrita admin delete" ON public.products FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "scrape_actions admin" ON public.scrape_actions;
CREATE POLICY "scrape_actions leitura admin" ON public.scrape_actions FOR SELECT TO authenticated USING ((SELECT private.is_admin()));
CREATE POLICY "scrape_actions escrita admin insert" ON public.scrape_actions FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "scrape_actions escrita admin update" ON public.scrape_actions FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "scrape_actions escrita admin delete" ON public.scrape_actions FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "scrape escrita admin" ON public.scrape_errors;
DROP POLICY IF EXISTS "scrape leitura admin" ON public.scrape_errors;
CREATE POLICY "scrape_errors leitura admin" ON public.scrape_errors FOR SELECT TO authenticated USING ((SELECT private.is_admin()));
CREATE POLICY "scrape_errors escrita admin insert" ON public.scrape_errors FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "scrape_errors escrita admin update" ON public.scrape_errors FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "scrape_errors escrita admin delete" ON public.scrape_errors FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS "scrape escrita admin" ON public.scrape_runs;
DROP POLICY IF EXISTS "scrape leitura admin" ON public.scrape_runs;
CREATE POLICY "scrape_runs leitura admin" ON public.scrape_runs FOR SELECT TO authenticated USING ((SELECT private.is_admin()));
CREATE POLICY "scrape_runs escrita admin insert" ON public.scrape_runs FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "scrape_runs escrita admin update" ON public.scrape_runs FOR UPDATE TO authenticated USING ((SELECT private.is_admin())) WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY "scrape_runs escrita admin delete" ON public.scrape_runs FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

CREATE INDEX IF NOT EXISTS canonical_products_category_id_fk_idx ON public.canonical_products(category_id);
CREATE INDEX IF NOT EXISTS categories_parent_id_fk_idx ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS list_template_items_template_id_fk_idx ON public.list_template_items(template_id);
CREATE INDEX IF NOT EXISTS notifications_alert_id_fk_idx ON public.notifications(alert_id);
CREATE INDEX IF NOT EXISTS notifications_user_id_fk_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS price_alerts_market_id_fk_idx ON public.price_alerts(market_id);
CREATE INDEX IF NOT EXISTS price_alerts_product_id_fk_idx ON public.price_alerts(product_id);
CREATE INDEX IF NOT EXISTS price_alerts_user_id_fk_idx ON public.price_alerts(user_id);
CREATE INDEX IF NOT EXISTS prices_source_id_fk_idx ON public.prices(source_id);
CREATE INDEX IF NOT EXISTS product_aliases_market_id_fk_idx ON public.product_aliases(market_id);
CREATE INDEX IF NOT EXISTS products_category_id_fk_idx ON public.products(category_id);
CREATE INDEX IF NOT EXISTS scrape_errors_run_id_fk_idx ON public.scrape_errors(run_id);
CREATE INDEX IF NOT EXISTS scrape_runs_market_id_fk_idx ON public.scrape_runs(market_id);
CREATE INDEX IF NOT EXISTS shopping_list_items_product_id_fk_idx ON public.shopping_list_items(product_id);
CREATE INDEX IF NOT EXISTS shopping_lists_user_id_fk_idx ON public.shopping_lists(user_id);

DROP INDEX IF EXISTS public.prices_market_collected_idx2;

