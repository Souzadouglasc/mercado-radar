import { NextResponse } from "next/server";
import { ingestBodySchema, type ProductPrice } from "@/lib/ingest/schema";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Rate-limit simples em memória (por instância): 30 req/min por IP
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  list.push(now);
  hits.set(ip, list);
  return list.length > 30;
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return base || "produto";
}

const SOURCE_IDS: Record<ProductPrice["source"], number> = {
  "site-jsonld": 1,
  graphql: 2,
  manual: 3,
  encarte: 4,
};

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Ingestão não configurada (CRON_SECRET ausente)." },
      { status: 503 },
    );
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip))
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = ingestBodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Corpo inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );

  const started = Date.now();
  const items = parsed.data.items;
  // market_slug distintos desta leva → market_id
  const slugs = [...new Set(items.map((i) => i.market_slug))];
  const supabase = await createServiceRoleClient();

  const { data: markets, error: marketsError } = await supabase
    .from("markets")
    .select("id, slug")
    .in("slug", slugs);
  if (marketsError)
    return NextResponse.json({ error: "Falha ao buscar mercados." }, { status: 500 });
  const marketBySlug = new Map((markets as { id: string; slug: string }[]).map((m) => [m.slug, m.id]));

  // Run de observabilidade (sem mercado específico → market_id null)
  const { data: run, error: runError } = await supabase
    .from("scrape_runs")
    .insert({ status: "PARTIAL", products_found: items.length })
    .select("id")
    .single();
  if (runError)
    return NextResponse.json({ error: "Falha ao registrar run." }, { status: 500 });
  const runId = (run as { id: string }).id;

  let valid = 0;
  let ignored = 0;
  let created = 0;
  const errors: { product_url?: string; error_type: string; message: string }[] = [];

  for (const item of items) {
    const marketId = marketBySlug.get(item.market_slug);
    if (!marketId) {
      ignored++;
      errors.push({ error_type: "market_not_found", message: `Mercado desconhecido: ${item.market_slug}` });
      continue;
    }
    // Produto existente? alias (market, raw_name) → senão nome canônico.
    let productId: string | null = null;
    const { data: alias } = await supabase
      .from("product_aliases")
      .select("product_id")
      .eq("market_id", marketId)
      .eq("raw_name", item.product_name)
      .maybeSingle();
    productId = (alias as { product_id: string } | null)?.product_id ?? null;

    if (!productId) {
      const { data: same } = await supabase
        .from("products")
        .select("id")
        .eq("name", item.product_name)
        .maybeSingle();
      productId = (same as { id: string } | null)?.id ?? null;
    }
    if (!productId) {
      // Upsert por slug derivado do nome
      const slug = slugify(
        [item.brand, item.product_name].filter(Boolean).join(" "),
      );
      const { data: inserted, error: insertError } = await supabase
        .from("products")
        .upsert(
          {
            name: item.product_name,
            slug,
            brand: item.brand ?? null,
            barcode: item.barcode ?? null,
            unit: item.unit ?? null,
            quantity: item.quantity ?? null,
            image_url: item.image_url ?? null,
          },
          { onConflict: "slug" },
        )
        .select("id")
        .single();
      if (insertError || !inserted) {
        ignored++;
        errors.push({
          product_url: item.source_url ?? undefined,
          error_type: "product_upsert_failed",
          message: insertError?.message ?? "Falha ao criar produto",
        });
        continue;
      }
      productId = (inserted as { id: string }).id;
      created++;
      // Registra alias p/ próximas levas do mesmo mercado
      await supabase.from("product_aliases").upsert(
        { product_id: productId, market_id: marketId, raw_name: item.product_name },
        { onConflict: "product_id,market_id,raw_name" },
      );
    } else if (item.image_url) {
      // Produto já existe — atualiza image_url se veio nova
      await supabase
        .from("products")
        .update({ image_url: item.image_url })
        .eq("id", productId);
    }
    const { error: priceError } = await supabase.from("prices").insert({
      product_id: productId,
      market_id: marketId,
      price: item.price,
      promotional_price: item.promotional_price ?? null,
      source_id: SOURCE_IDS[item.source],
      source_url: item.source_url ?? null,
      collected_at: item.collected_at,
    });
    if (priceError) {
      ignored++;
      errors.push({
        product_url: item.source_url ?? undefined,
        error_type: "price_insert_failed",
        message: priceError.message,
      });
      continue;
    }
    valid++;
  }

  const status = valid === 0 ? "FAILED" : ignored === 0 ? "SUCCESS" : "PARTIAL";
  await supabase
    .from("scrape_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      products_valid: valid,
      products_ignored: ignored,
      products_new: created,
      products_updated: valid,
      error_summary: errors.length ? errors.slice(0, 5).map((e) => e.message).join(" | ") : null,
      duration_ms: Date.now() - started,
    })
    .eq("id", runId);
  if (errors.length) {
    await supabase.from("scrape_errors").insert(
      errors.slice(0, 100).map((e) => ({
        run_id: runId,
        product_url: e.product_url ?? null,
        error_type: e.error_type,
        message: e.message,
      })),
    );
  }

  return NextResponse.json({ ok: true, run_id: runId, valid, ignored, created, status });
}
