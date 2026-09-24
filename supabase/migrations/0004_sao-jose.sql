-- MercadoRadar - Tarefa I1: lojas São José (Fort Kobrasol, Koch Palhoça).
-- Idempotente: updates por slug (re-rodar não duplica nem quebra).
-- Evidência dos storeIds em scrapers/markets/fort.ts e koch.ts.

update markets
set osuper_store_id = '1638',
    city = 'São José',
    website_url = 'https://fortatacadista.com.br',
    osuper_api_url = 'https://api.fortatacadista.com.br/storefront/graphql',
    updated_at = now()
where slug = 'fort';

update markets
set osuper_store_id = '1412',
    city = 'São José (atendida por Palhoça)',
    website_url = 'https://www.superkoch.com.br',
    osuper_api_url = 'https://api.superkoch.com.br/storefront/graphql',
    updated_at = now()
where slug = 'koch';
