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

interface ScrapeActionRow {
  id: string;
  market_slug: string;
  action_type: string;
  params: Record<string, unknown>;
}

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

  // Recover actions abandoned by a cancelled or timed-out GitHub Actions job.
  // The queue has no lease column, so started_at is the recovery cutoff.
  const staleBefore = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  const { error: recoveryError } = await supabase
    .from("scrape_actions")
    .update({
      status: "pending",
      started_at: null,
      finished_at: null,
      error_summary: "Execução anterior expirou; ação devolvida à fila.",
    })
    .eq("status", "running")
    .lt("started_at", staleBefore);
  if (recoveryError) {
    console.error("Erro ao recuperar ações expiradas:", recoveryError.message);
    process.exit(1);
  }

  const matrix: Array<{
    market_slug: string;
    action_ids: string;
    action_urls: string;
    limit: number;
    action_type: string;
    params: Record<string, unknown>;
  }> = [];

  for (let i = 0; i < maxActions; i++) {
    // Use the atomic RPC for the normal queue. For an explicit market filter,
    // claim only matching rows with a compare-and-set update so other actions
    // remain pending for their own workers.
    let actions: ScrapeActionRow[] | null = null;
    let error: { message: string } | null = null;
    if (markets.length > 0) {
      const { data: candidate, error: selectError } = await supabase
        .from("scrape_actions")
        .select("*")
        .eq("status", "pending")
        .in("market_slug", markets)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (selectError) error = selectError;
      else if (candidate) {
        const { data: claimed, error: claimError } = await supabase
          .from("scrape_actions")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", candidate.id)
          .eq("status", "pending")
          .select();
        if (claimError) error = claimError;
        actions = claimed ?? [];
      } else {
        actions = [];
      }
    } else {
      const result = await supabase.rpc("get_next_scrape_action");
      actions = result.data;
      error = result.error;
    }
    if (error) {
      console.error("Erro ao buscar/assumir scrape_actions:", error.message);
      process.exit(1);
    }

    if (!actions || actions.length === 0) {
      break; // sem mais ações pendentes
    }

    const action = actions[0];

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

