#!/usr/bin/env node
/**
 * CLI: tsx scrapers/runner/run.ts --market fort --limit 200 [--dry-run]
 * Coleta via provider Osuper e envia em batches de 100 p/ POST /api/ingest/prices.
 * Exit 1 se products_found < 30% da baseline OU taxa de erro > 50%.
 */
import { toRunStats } from "../core/types.js";
import { fortConfig } from "../markets/fort.js";
import { kochConfig } from "../markets/koch.js";
import { scrapeOsuperMarket, type OsuperMarketConfig } from "../markets/osuper.js";

const MARKETS: Record<string, OsuperMarketConfig> = {
  fort: fortConfig,
  koch: kochConfig,
};

// Baseline: mediana de 7 dias de products_found. Seed = limit default até haver histórico.
// TODO: ler baseline real de scrape_runs via Supabase quando houver histórico.
const BASELINE_PRODUCTS_FOUND = 200;

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return {
    market: String(args.market ?? ""),
    limit: args.limit != null ? Number(args.limit) : 200,
    dryRun: args["dry-run"] === true,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function postBatch(appUrl: string, secret: string, items: unknown[]) {
  const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/ingest/prices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`ingest HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { valid: number; ignored: number; status: string };
}

async function main() {
  const { market, limit, dryRun } = parseArgs(process.argv.slice(2));
  const config = MARKETS[market];
  if (!config) {
    console.error(`Mercado desconhecido: "${market}". Use --market fort|koch.`);
    process.exit(2);
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 2000) {
    console.error(`--limit inválido: ${limit}. Use 1..2000.`);
    process.exit(2);
  }

  console.log(`[run] market=${market} limit=${limit} dryRun=${dryRun}`);
  const result = await scrapeOsuperMarket(config, {
    limit,
    onProgress: (done, total, url) => {
      if (done % 25 === 0 || done === total) console.log(`[run] ${done}/${total} ${url}`);
    },
  });
  const stats = toRunStats(result);
  console.log(
    JSON.stringify({ ...stats, errors: result.outcomes.filter((o) => !o.ok).slice(0, 10) }),
  );

  if (!dryRun) {
    const appUrl = process.env.APP_URL;
    const secret = process.env.CRON_SECRET;
    if (!appUrl || !secret) {
      console.error("[run] APP_URL e CRON_SECRET são obrigatórios (sem --dry-run).");
      process.exit(2);
    }
    let valid = 0;
    let ignored = 0;
    for (const batch of chunk(result.items, 100)) {
      const r = await postBatch(appUrl, secret, batch);
      valid += r.valid;
      ignored += r.ignored;
      console.log(`[run] batch ok: valid=${r.valid} ignored=${r.ignored} status=${r.status}`);
    }
    console.log(JSON.stringify({ sent: result.items.length, valid, ignored }));
  } else {
    console.log(JSON.stringify({ dryRun: true, sample: result.items.slice(0, 5) }, null, 2));
  }

  // Gates de qualidade
  const belowBaseline = stats.productsFound < 0.3 * Math.min(BASELINE_PRODUCTS_FOUND, limit);
  if (belowBaseline) {
    console.error(
      `[run] FAIL: products_found=${stats.productsFound} < 30% da baseline (${Math.min(BASELINE_PRODUCTS_FOUND, limit)}).`,
    );
    process.exit(1);
  }
  if (stats.errorRate > 0.5) {
    console.error(`[run] FAIL: taxa de erro=${(stats.errorRate * 100).toFixed(1)}% > 50%.`);
    process.exit(1);
  }
  console.log("[run] OK");
}

main().catch((err) => {
  console.error("[run] erro fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
