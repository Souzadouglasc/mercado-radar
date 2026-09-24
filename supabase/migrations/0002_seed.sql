-- MercadoRadar - seed: 4 mercados, fontes de preco, categorias base
insert into price_sources (id, name) values
  (1, 'site-jsonld'),
  (2, 'graphql'),
  (3, 'manual'),
  (4, 'encarte')
on conflict (id) do nothing;

insert into markets (name, slug, website_url, osuper_api_url, osuper_store_id, city, active) values
  ('Fort Atacadista', 'fort', 'https://www.fortatacadista.com.br', 'https://api.fortatacadista.com.br/storefront/graphql', '1585', 'Balneário Camboriú', true),
  ('SuperKoch', 'koch', 'https://www.superkoch.com.br', 'https://api.superkoch.com.br/storefront/graphql', null, 'Camboriú', true),
  ('Brasil Atacadista', 'brasil', 'https://brasilatacadista.com.br', null, null, null, true),
  ('Komprão', 'komprao', 'https://www.komprao.com.br', null, null, null, true)
on conflict (slug) do nothing;

insert into categories (name, slug) values
  ('Mercearia', 'mercearia'),
  ('Hortifruti', 'hortifruti'),
  ('Açougue', 'acougue'),
  ('Frios e Laticínios', 'frios-e-laticinios'),
  ('Bebidas', 'bebidas'),
  ('Limpeza', 'limpeza'),
  ('Higiene e Beleza', 'higiene-e-beleza'),
  ('Padaria', 'padaria'),
  ('Congelados', 'congelados'),
  ('Pet', 'pet')
on conflict (slug) do nothing;
