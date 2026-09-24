export interface ParsedName {
  canonical: string;
  quantity: number | null;
  unit: string | null;
}

const UNITS = ["kg", "g", "l", "ml", "un", "pct", "cx", "dz", "m", "cm"] as const;

// "5KG" | "500 G" | "1,5L" | "20UN" após hífen/espaço (fim ou meio do nome).
const QTY_RE = /[\s-]+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un|pct|cx|dz|m|cm)\.?/i;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase();
  if (u === "g" || u === "kg") return u;
  if (u === "ml" || u === "l") return u;
  return u; // un, pct, cx, dz, m, cm
}

/** Lowercase, sem acentos, colapsa espaços; separa quantidade/unidade do fim do nome. */
export function normalizeName(raw: string): ParsedName {
  const collapsed = stripAccents(raw).toLowerCase().replace(/\s+/g, " ").trim();
  const m = collapsed.match(QTY_RE);
  if (!m) return { canonical: collapsed, quantity: null, unit: null };
  const quantity = parseFloat(m[1].replace(",", "."));
  const unit = normalizeUnit(m[2]);
  const idx = m.index ?? 0;
  const canonical = (collapsed.slice(0, idx) + collapsed.slice(idx + m[0].length))
    .replace(/\s+/g, " ")
    .replace(/[\s-]+$/, "")
    .trim();
  return { canonical, quantity, unit };
}

export function slugify(value: string): string {
  const base = stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return base || "produto";
}

/** pt-BR: "R$ 1.234,56" → 1234.56 | "49.90" → 49.9 | "4,49" → 4.49. null se inválido. */
export function parsePrice(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/R\$\s?/i, "").trim();
  if (!s) return null;
  if (!/^[\d.,\s]+$/.test(s)) return null;
  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    // pt-BR: milhar com ponto, decimal com vírgula
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  // apenas pontos: último é decimal se tiver 1-2 dígitos após ele
  if (/^\d+(\.\d+)+$/.test(s)) {
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    s = last.length <= 2 ? parts.slice(0, -1).join("") + "." + last : parts.join("");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
