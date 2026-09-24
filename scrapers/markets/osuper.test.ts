import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  parseSitemapEntries,
  scrapeOsuperMarket,
  selectEntries,
  type OsuperMarketConfig,
} from "./osuper.js";

const cfg: OsuperMarketConfig = {
  marketSlug: "test",
  siteUrl: "https://exemplo.com.br",
  apiUrl: "https://api.exemplo.com.br/storefront/graphql",
  storeId: "1638",
  cookieSuffix: "334",
};

function sitemapXml(urls: string[]): string {
  return (
    `<?xml version="1.0"?><urlset>` +
    urls.map((u) => `<url><loc>${u}</loc><changefreq>daily</changefreq></url>`).join("") +
    `</urlset>`
  );
}

function productHtml(name: string, price: string): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name,
    sku: "1",
    offers: { price },
  })}</script></head><body></body></html>`;
}

describe("parseSitemapEntries", () => {
  it("extrai lastmod quando presente; vazio quando ausente (Fort/Koch real)", () => {
    const withLm = parseSitemapEntries(
      `<urlset><url><loc>https://x/produtos/1/a</loc><lastmod>2026-09-24T06:00:00Z</lastmod></url></urlset>`,
    );
    assert.equal(withLm[0].lastmod, "2026-09-24T06:00:00Z");
    const without = parseSitemapEntries(
      `<urlset><url><loc>https://x/produtos/1/a</loc><changefreq>daily</changefreq></url></urlset>`,
    );
    assert.equal(without[0].lastmod, undefined);
  });
  it("dedup e ignora não-produto", () => {
    const entries = parseSitemapEntries(
      `<urlset><url><loc>https://x/produtos/1/a</loc></url><url><loc>https://x/produtos/1/a</loc></url><url><loc>https://x/categorias</loc></url></urlset>`,
    );
    assert.equal(entries.length, 1);
  });
});

describe("selectEntries (incremental + skip)", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");
  const urls = ["a", "b", "c"].map((s) => `https://x/produtos/${s}`);
  it("filtra lastmod > 72h, mantém sem lastmod", () => {
    const entries = [
      { url: urls[0], lastmod: "2026-09-24T10:00:00Z" }, // 2h — fica
      { url: urls[1], lastmod: "2026-09-20T10:00:00Z" }, // 4 dias — sai
      { url: urls[2] }, // sem lastmod — fica
    ];
    const { selected, hasLastmod } = selectEntries(entries, {
      limit: 10,
      incremental: true,
      nowMs: now,
    });
    assert.equal(hasLastmod, true);
    assert.deepEqual(
      selected.map((e) => e.url),
      [urls[0], urls[2]],
    );
  });
  it("--full ignora o filtro", () => {
    const entries = [{ url: urls[0], lastmod: "2026-09-01T00:00:00Z" }];
    const { selected } = selectEntries(entries, {
      limit: 10,
      incremental: true,
      full: true,
      nowMs: now,
    });
    assert.equal(selected.length, 1);
  });
  it("sem lastmod: fatia por skip/limit e dá a volta (módulo)", () => {
    const entries = urls.map((url) => ({ url }));
    const r1 = selectEntries(entries, { limit: 2, incremental: true, skip: 2, nowMs: now });
    assert.equal(r1.hasLastmod, false);
    assert.deepEqual(
      r1.selected.map((e) => e.url),
      [urls[2], urls[0]],
    );
    const r2 = selectEntries(entries, { limit: 2, incremental: true, skip: 5, nowMs: now });
    assert.deepEqual(
      r2.selected.map((e) => e.url),
      [urls[2], urls[0]],
    );
  });
});

describe("scrapeOsuperMarket (concorrência + cookie de loja)", () => {
  it("coleta N urls com concurrency=4 e onProgress thread-safe (1..N sem pular)", async () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://exemplo.com.br/produtos/${i}/x`);
    const orig = globalThis.fetch;
    const cookies: (string | undefined)[] = [];
    // @ts-expect-error mock mínimo p/ fetch
    globalThis.fetch = mock.fn(
      async (url: string, init?: { headers?: Record<string, string> }) => {
        if (url.endsWith("/sitemap.xml")) return { ok: true, text: async () => sitemapXml(urls) };
        cookies.push(init?.headers?.Cookie);
        await new Promise((r) => setTimeout(r, 5));
        return { ok: true, text: async () => productHtml("Arroz 5kg", "19.90") };
      },
    );
    try {
      const seen: number[] = [];
      const res = await scrapeOsuperMarket(cfg, {
        limit: 8,
        concurrency: 4,
        throttleMs: 40,
        retries: 0,
        onProgress: (done) => seen.push(done),
      });
      assert.equal(res.items.length, 8);
      assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
      assert.ok(cookies.every((c) => c === `st_334={"id":"1638"}`));
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("sem cookieSuffix válido não envia Cookie", async () => {
    const urls = [`https://exemplo.com.br/produtos/1/x`];
    const orig = globalThis.fetch;
    const cookies: (string | undefined)[] = [];
    // @ts-expect-error mock mínimo p/ fetch
    globalThis.fetch = mock.fn(
      async (url: string, init?: { headers?: Record<string, string> }) => {
        if (url.endsWith("/sitemap.xml")) return { ok: true, text: async () => sitemapXml(urls) };
        cookies.push(init?.headers?.Cookie);
        return { ok: true, text: async () => productHtml("Arroz 5kg", "19.90") };
      },
    );
    try {
      const res = await scrapeOsuperMarket(
        { ...cfg, cookieSuffix: undefined, storeId: "TODO-x" },
        { limit: 1, concurrency: 1, throttleMs: 1, retries: 0 },
      );
      assert.equal(res.items.length, 1);
      assert.deepEqual(cookies, [undefined]);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("throttle agregado: 8 urls concurrency=4 throttleMs=40 termina rápido (< 2s)", async () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://exemplo.com.br/produtos/${i}/x`);
    const orig = globalThis.fetch;
    // @ts-expect-error mock mínimo p/ fetch
    globalThis.fetch = mock.fn(async (url: string) => {
      if (url.endsWith("/sitemap.xml")) return { ok: true, text: async () => sitemapXml(urls) };
      return { ok: true, text: async () => productHtml("Arroz 5kg", "19.90") };
    });
    try {
      const t0 = Date.now();
      await scrapeOsuperMarket(cfg, {
        limit: 8,
        concurrency: 4,
        throttleMs: 40,
        retries: 0,
      });
      assert.ok(Date.now() - t0 < 2000, "paralelismo não acelerou");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
