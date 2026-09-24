#!/usr/bin/env node
/**
 * CLI: tsx scrapers/runner/run.ts --market fort --limit 200 [--dry-run] [--concurrency 4] [--incremental|--full] [--skip N]
 * Nova versão usa Orchestrator + Provider Registry.
 * Suporta flags --action-ids e --action-urls para dynamic matrix do GitHub Actions.
 * Mantém compatibilidade com flags antigas.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createServiceRoleClient } from "../lib/supabase.js";
import { createOrchestrator, type OrchestratorOptions } from "./orchestrator.js";
import { getEnabledSlugs, getMarketConfig } from "../config/markets.config.js";

const BASELINE_PRODUCTS_FOUND = 200;

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i++; }
  }
  return {
    market: String(args.market ?? ""),
    markets: args.markets ? String(args.markets).split(",").map(s => s.trim()) : [],
    limit: args.limit != null ? Number(args.limit) : 200,
    dryRun: args["dry-run"] === true,
    concurrency: args.concurrency != null ? Number(args.concurrency) : 4,
    incremental: args.incremental === true,
    full: args.full === true,
    skip: args.skip != null ? Number(args.skip) : 0,
    actionIds: args["action-ids"] ? String(args["action-ids"]).split(",") : [],
    actionUrls: args["action-urls"] ? String(args["action-urls"]).split("|") : [],
  };
}

async function main() {
  const { market, markets, limit, dryRun, concurrency, incremental, full, skip, actionIds, actionUrls } = parseArgs(
    process.argv.slice(2),
  );

  // Determina quais mercados processar
  let targetMarkets: string[];
  if (markets.length > 0) {
    targetMarkets = markets;
  } else if (market) {
    targetMarkets = [market];
  } else {
    targetMarkets = getEnabledSlugs();
  }

  // Valida mercados
  for (const m of targetMarkets) {
    if (!getMarketConfig(m)) {
      console.error(`Mercado desconhecido: "${m}". Use: ${getEnabledSlugs().join("|")}`);
      process.exit(2);
    }
  }

  if (!Number.isFinite(limit) || limit < 1 || limit > 2000) {
    console.error(`--limit inválido: ${limit}. Use 1..2000.`);
    process.exit(2);
  }
  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 8) {
    console.error(`--concurrency inválido: ${concurrency}. Use 1..8.`);
    process.exit(2);
  }
  if (!Number.isFinite(skip) || skip < 0) {
    console.error(`--skip inválido: ${skip}. Use >= 0.`);
    process.exit(2);
  }

  console.log(
    `[run] markets=${targetMarkets.join(",")} limit=${limit} dryRun=${dryRun} concurrency=${concurrency} incremental=${incremental} full=${full} skip=${skip}`,
  );

  // Cria orchestrator
  const supabase = createServiceRoleClient();
  const orchestrator = await createOrchestrator({
    markets: targetMarkets,
    collectOptions: {
      limit,
      incremental,
      full,
      skip,
      concurrency,
      throttleMs: 2000,
      actionIds,
      actionUrls,
    },
    dryRun,
    onLog: (msg) => console.log(msg),
  });

  // Executa
  const results = await orchestrator.runAll();

  // Verifica gates de qualidade e exit code
  let hasFailure = false;
  let hasQualityWarning = false;

  for (const result of results) {
    if (!result.success) {
      console.error(`[run] ${result.marketSlug} FALHOU: ${result.error}`);
      hasFailure = true;
      continue;
    }

    const marketConfig = getMarketConfig(result.marketSlug);
    const baseline = marketConfig?.baseline ?? { minProducts: 100, maxErrorRate: 0.5 };

    // Quality gates (apenas para providers com baseline significativa)
    const belowBaseline = result.collectResult.items.length < 0.3 * Math.min(baseline.minProducts, limit);
    if (belowBaseline && baseline.minProducts > 10) {
      console.error(
        `[run] ${result.marketSlug} QUALITY WARNING: products_found=${result.collectResult.items.length} < 30% da baseline (${Math.min(baseline.minProducts, limit)}).`
      );
      hasQualityWarning = true;
    }
    if (result.collectResult.stats.errorRate > baseline.maxErrorRate) {
      console.error(
        `[run] ${result.marketSlug} QUALITY WARNING: taxa de erro=${(result.collectResult.stats.errorRate * 100).toFixed(1)}% > ${(baseline.maxErrorRate * 100).toFixed(0)}%.`
      );
      hasQualityWarning = true;
    }

    // Log compatível com formato antigo
    console.log(
      JSON.stringify({
        ...result.collectResult.stats,
        errors: result.collectResult.outcomes.filter((o) => !o.ok).slice(0, 10),
      }),
    );

    if (result.ingestResult) {
      console.log(
        JSON.stringify({
          sent: result.collectResult.items.length,
          valid: result.ingestResult.valid,
          ignored: result.ingestResult.ignored,
          created: result.ingestResult.created,
          status: result.ingestResult.status,
          run_id: result.ingestResult.runId,
        }),
      );
    } else {
      console.log(
        JSON.stringify({ dryRun: true, sample: result.collectResult.items.slice(0, 5) }, null, 2)
      );
    }
  }

  // Exit codes: 0=ok, 1=quality warning, 2=usage/env, 3=failure
  if (hasFailure) {
    process.exit(3);
  }
  if (hasQualityWarning) {
    process.exit(1);
  }
  console.log("[run] OK");
}

main().catch((err) => {
  console.error("[run] erro fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});