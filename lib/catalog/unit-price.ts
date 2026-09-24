/**
 * Normalização de preço por unidade de medida.
 * Retorna preço normalizado em R$/kg (para g, kg), R$/L (para ml, L), R$/un (para un, pct, etc.).
 * Se não houver quantity/unit válidos, retorna null.
 */

export type UnitPriceResult = {
  /** Preço por unidade normalizado (R$/kg, R$/L, R$/un) */
  pricePerUnit: number;
  /** Unidade base normalizada: 'kg', 'L' ou 'un' */
  baseUnit: 'kg' | 'L' | 'un';
  /** Label amigável para exibição: 'R$ 4,98/kg', 'R$ 2,50/L', 'R$ 1,20/un' */
  label: string;
  /** Valor original (preço total) */
  originalPrice: number;
  /** Quantidade original */
  quantity: number | null;
  /** Unidade original */
  unit: string | null;
};

/**
 * Normaliza a unidade para a base: kg, L ou un
 */
export function normalizeUnit(unit: string | null): 'kg' | 'L' | 'un' | null {
  if (!unit) return null;
  const u = unit.toLowerCase().trim();

  // Peso -> kg
  if (['g', 'gr', 'grama', 'gramas', 'kg', 'quilograma', 'quilogramas'].includes(u)) {
    return 'kg';
  }
  // Volume -> L
  if (['ml', 'mililitro', 'mililitros', 'l', 'litro', 'litros'].includes(u)) {
    return 'L';
  }
  // Unidade -> un
  if (['un', 'unid', 'unidade', 'unidades', 'pct', 'peca', 'peça', 'pecas', 'peças', 'pc', 'pcs', 'cx', 'caixa', 'pacote', 'pct'].includes(u)) {
    return 'un';
  }
  return null;
}

/**
 * Converte quantidade para a unidade base
 * @returns quantidade na unidade base (kg, L ou un), ou null se não for possível converter
 */
export function toBaseQuantity(quantity: number | null, unit: string | null): number | null {
  if (quantity === null || quantity === undefined || quantity <= 0) return null;
  const baseUnit = normalizeUnit(unit);
  if (!baseUnit) return null;

  const u = unit?.toLowerCase().trim() ?? '';

  if (baseUnit === 'kg') {
    // g -> kg (divide por 1000)
    if (['g', 'gr', 'grama', 'gramas'].includes(u)) return quantity / 1000;
    // kg -> kg (já está na base)
    if (['kg', 'quilograma', 'quilogramas'].includes(u)) return quantity;
  }

  if (baseUnit === 'L') {
    // ml -> L (divide por 1000)
    if (['ml', 'mililitro', 'mililitros'].includes(u)) return quantity / 1000;
    // L -> L (já está na base)
    if (['l', 'litro', 'litros'].includes(u)) return quantity;
  }

  if (baseUnit === 'un') {
    // un, pct, etc. -> un (já está na base)
    return quantity;
  }

  return null;
}

/**
 * Calcula preço por unidade normalizada
 * @param price - Preço total do produto
 * @param quantity - Quantidade (ex: 500, 1, 1.5)
 * @param unit - Unidade (ex: 'g', 'kg', 'ml', 'L', 'un', 'pct')
 * @returns UnitPriceResult ou null se não for possível calcular
 */
export function pricePerUnit(
  price: number,
  quantity: number | null,
  unit: string | null
): UnitPriceResult | null {
  if (price === null || price === undefined || price <= 0) return null;

  const baseQty = toBaseQuantity(quantity, unit);
  if (baseQty === null || baseQty <= 0) return null;

  const baseUnit = normalizeUnit(unit);
  if (!baseUnit) return null;

  const pricePerUnit = price / baseQty;

  // Formata label: "R$ X,XX/kg", "R$ X,XX/L", "R$ X,XX/un"
  const formattedPrice = pricePerUnit.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const label = `${formattedPrice}/${baseUnit}`;

  return {
    pricePerUnit,
    baseUnit,
    label,
    originalPrice: price,
    quantity,
    unit,
  };
}

/**
 * Versão que aceita objeto produto (para uso direto com ProductRow)
 */
export function pricePerUnitFromProduct(
  price: number,
  product: { quantity: number | null; unit: string | null }
): UnitPriceResult | null {
  return pricePerUnit(price, product.quantity, product.unit);
}