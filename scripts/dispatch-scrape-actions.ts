#!/usr/bin/env node
/**
 * Dispatcher para GitHub Actions — busca scrape_actions pendentes via RPC get_next_scrape_action
 * e gera matrix dinâmica.
 * Uso: npx tsx scripts/dispatch-scrape-actions.ts [--max-actions N] [--markets fort,koch,brasil,komprao]
 * Output: JSON para stdout com { matrix: [...], hasWork: boolean }
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
    maxActions: args["max-actions"] ? Number(args["max-actions"]) : 20,
    markets: args.markets ? String(args.markets).split(",").map(s => s.trim()) : [],
  };
}

async function main() {
  const { maxActions, markets } = parseArgs(process.argv.slice(2));

  const matrix: Array<{
    market_slug: string;
    action_ids: string;
    action_urls: string;
    limit: number;
    action_type: string;
    params: Record<string, unknown>;
  }> = [];

  for (let i = 0; i < maxActions; i++) {
    // Chama RPC get_next_scrape_action (usa FOR UPDATE SKIP LOCKED para concorrência)
    const { data: actions, error } = await supabase.rpc("get_next_scrape_action");
    if (error) {
      console.error("Erro ao buscar scrape_actions via RPC:", error.message);
      process.exit(1);
    }

    if (!actions || actions.length === 0) {
      break; // sem mais ações pendentes
    }

    const action = actions[0];

    // Filtra por mercados se especificado
    if (markets.length > 0 && !markets.includes(action.market_slug)) {
      // Se não é dos mercados desejados, marca como done e continua
      await supabase.rpc("complete_scrape_action", {
        p_action_id: action.id,
        p_status: "failed",
        p_error_summary: `Mercado ${action.market_slug} não incluído no filtro --markets`,
      });
      continue;
    }

    // Extrai URLs dos params
    const urls = (action.params?.urls as string[]) || [];
    const limit = (action.params?.limit as number) || urls.length || 200;

    matrix.push({
      market_slug: action.market_slug,
      action_ids: action.id,
      action_urls: urls.join("|"),
      limit,
      action_type: action.action_type,
      params: action.params,
    });
  }

  if (matrix.length === 0) {
    console.log(JSON.stringify({ matrix: [], hasWork: false }));
    return;
  }

  console.log(JSON.stringify({ matrix, hasWork: true }));
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});