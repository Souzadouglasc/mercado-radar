# MercadoRadar — Backlog futuro (ideias do dono, 2026-09-24)

## 1. Listas prontas (templates)
- Templates como "Rancho do Mês", "Compra Semanal", "Churrasco", "Limpeza da casa".
- Pesquisar cestas típicas brasileiras e pré-preencher produtos + quantidades sugeridas.
- Usuário clona o template e ajusta (remove/adiciona itens).
- Tabela provável: `list_templates` + `list_template_items` (ou `is_template` em `shopping_lists`).

## 2. Busca por categoria de produto + comparador
- Buscar "sabão em pó" retorna TODOS os sabões em pó (não só um produto), com tabela comparativa: marca, tamanho, preço, **preço por unidade de medida** (R$/kg, R$/L) — esse é o comparador que importa.
- Pré-requisito técnico: normalização já separa `quantity`/`unit`; falta exibir `price_per_unit` e agrupar por categoria/tipo.
- Discrepância de preço: destacar % entre o mais barato e o mais caro da categoria.

## 3. Análise por IA (futuro, com custo)
- Sobre o comparador da categoria: IA avalia melhor qualidade, melhor custo-benefício, recomendação.
- Opções gratuitas/baratas a avaliar na época: OpenRouter free tier, Groq free tier, Gemini free tier — via server-side, cache agressivo (1 análise por categoria/semana, não por request).
- NÃO implementar agora: sem volume de dados a análise não tem valor; priorizar coleta + normalização primeiro.

Ordem sugerida: (2) preço-por-unidade → (1) templates → (3) IA.
