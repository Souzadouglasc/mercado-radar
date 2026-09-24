"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Categoria do produto para placeholder ilustrado.
 * Baseado em categorias comuns de supermercado.
 */
export type ProductCategory =
  | "mercearia"
  | "hortifruti"
  | "acougue"
  | "peixaria"
  | "padaria"
  | "laticinios"
  | "bebidas"
  | "limpeza"
  | "higiene"
  | "pet"
  | "bazar"
  | "congelados"
  | "default";

/**
 * Mapeia nome/brand/category do produto para uma categoria visual.
 * Heurística simples baseada em palavras-chave.
 */
export function inferCategory(product: {
  name: string;
  brand?: string | null;
  category?: string | null;
}): ProductCategory {
  const text = `${product.name} ${product.brand ?? ""} ${product.category ?? ""}`.toLowerCase();

  // Hortifruti
  if (
    /\b(verdura|legume|fruta|alface|tomate|batata|cenoura|cebola|alho|banana|maçã|maca|laranja|mamao|mamao|abacaxi|melancia|uva|manga|kiwi|morango|brocolis|couve|espinafre|pepino|abobora|chuchu|mandioca|inhame|batata.doce|alface|rucula|agriao|salsa|cebolinha|coentro|hortelã|manjericão|orelha)\b/.test(
      text,
    )
  )
    return "hortifruti";

  // Açougue
  if (
    /\b(carne|bife|frango|peito|coxa|sobrecoxa|asa|linguiça|linguica|salsicha|hamburguer|hambúrguer|bacon|presunto|mortadela|salame|pernil|costela|picanha|alcatra|contra.filé|contrafilé|maminha|fraldinha|acém|acem|paleta|carne.moida|carne.moída|miolo|patinho|coxão|coxao)\b/.test(
      text,
    )
  )
    return "acougue";

  // Peixaria
  if (
    /\b(peixe|camarão|camarao|tilapia|salmão|salamão|bacalhau|sardinha|atum|pescada|merluza|corvina|namorado|robalo|tainha|ostra|mexilhão|mexilhao|lula|polvo|frutos.do.mar)\b/.test(
      text,
    )
  )
    return "peixaria";

  // Padaria
  if (
    /\b(pão|pao|pães|paes|pão.de|pao.de|pão.francês|pao.frances|pão.integral|pao.integral|biscoito|bolacha|bolo|torta|tortinha|sonho|rosca|broa|bolacha|cookie|bolacha.creme|bolacha.chocolate|tostado|torrada|pão.de.queijo|pao.de.queijo|pão.de.leite|pao.de.leite)\b/.test(
      text,
    )
  )
    return "padaria";

  // Laticínios
  if (
    /\b(leite|iogurte|yogurte|queijo|requeijão|requeijao|manteiga|margarina|creme.de.leite|creme.de.leite|leite.condensado|leite.em.pó|leite.em.po|leite.em.po|nata|coalhada|kfir|kefir|bebida.láctea|bebida.lactea|desnatado|integral|semidesnatado|semi.desnatado|zero.lactose|lactose.free|a2|uht|pasteurizado|tipo.a|tipo.b|tipo.c)\b/.test(
      text,
    )
  )
    return "laticinios";

  // Bebidas
  if (
    /\b(refrigerante|coca|pepsi|guarana|guaraná|sprite|fanta|soda|água|agua|mineral|com.gás|com.gas|sem.gás|sem.gas|suco|nectar|néctar|del.valle|kapo|maguary|ado|natural.one|chai|mate|matte|gelo|energético|energetico|red.bull|burn|monster|cerveja|skol|brahma|antarctica|heineken|stella|budweiser|corona|vinho|espumante|whisky|vodka|gin|cachaça|cachaca|licor|conhaque|rum|tequila)\b/.test(
      text,
    )
  )
    return "bebidas";

  // Limpeza
  if (
    /\b(detergente|sabão|sabao|sabão.em.pó|sabao.em.po|amaciante|alvejante|água.sanitaria|agua.sanitaria|desinfetante|limpa|multiuso|multiuso|veja|bombril|assolan|ypioc|sapel|qboa|limpador|desengordurante|limpa.vidros|limpa.vidro|lustra.móveis|lustra.moveis|cera|pano|esponja|bucha|palha.de.aço|palha.de.aco|lã.de.aço|la.de.aco|saco.lixo|saco.para.lixo)\b/.test(
      text,
    )
  )
    return "limpeza";

  // Higiene
  if (
    /\b(shampoo|condicionador|sabonete|saboneteira|creme.dental|pasta.de.dente|escova.dental|fio.dental|enxaguante|desodorante|antitranspirante|absorvente|fralda|lenço.umedecido|lenco.umedecido|papel.higiênico|papel.higienico|algodão|algodao|cotonete|barbeador|lamina.de.barbear|lâmina.de.barbear|espuma.de.barbear|gel.de.barbear|pós.barba|pos.barba|hidratante|protetor.solar|bronzeador|repelente|perfume|colonia|colônia|body.splash|sabonete.liquido|sabonete.liquido|gel.banho|oleo.corpo|oleo.banho|creme.corpo|loção|locao)\b/.test(
      text,
    )
  )
    return "higiene";

  // Pet
  if (
    /\b(ração|racao|pet|gato|cachorro|cão|cao|ração.seca|racao.seca|ração.umida|racao.umida|sachê|sache|petisco|ossos|areia.gato|areia.para.gato|tapete.higiênico|tapete.higienico|coleira|guia|brinquedo.pet|cama.pet|casinha|shampoo.pet|condicionador.pet|vermifugo|antipulgas|carrapato)\b/.test(
      text,
    )
  )
    return "pet";

  // Bazar
  if (
    /\b(pilha|bateria|carregador|cabo|fio|extensão|extensao|régua|regua|tomada|adaptador|lâmpada|lampada|led|fluorescente|vela|fosforo|fosforo|isqueiro|alicate|chave.de.fenda|martelo|prego|parafuso|bucha|trena|fita.métrica|fita.metrica|fita.isolante|fita.crepe|cola|super.bonder|epoxi|silicone|vedante|pincel|rola|rolo.pintura|lona|plástico|plastico|saco.plástico|saco.plastico|saco.zip|ziplock|pote|tupperware|organizador|cesto|caixa.organizadora|gancho|cabide|varal|pregado|prendedor)\b/.test(
      text,
    )
  )
    return "bazar";

  // Congelados
  if (
    /\b(congelado|congelada|sorvete|gelado|picolé|picole|açai|acai|polpa|polpa.de.fruta|hambúrguer.congelado|hamburguer.congelado|batata.frita|batata.frita|nuggets|frango.congelado|peixe.congelado|legumes.congelados|massa.congelada|lasanha|pizza|empada|pastel|coxinha|risoles|kibe|quibe|bolinho.de.chuva|pão.de.queijo.congelado|pao.de.queijo.congelado)\b/.test(
      text,
    )
  )
    return "congelados";

  // Mercearia (padrão para alimentos secos/embalados)
  if (
    /\b(arroz|feijão|feijao|macarrão|macarrao|farinha|açucar|acucar|sal|óleo|oleo|azeite|vinagre|molho|catchup|ketchup|mostarda|maionese|molho.shoyu|shoyu|molho.ingles|molho.ingles|tempero|caldo|knorr|sazón|sazon|ajinomoto|fermento|bicarbonato|fermento.em.pó|fermento.em.po|gelatina|pudim|flan|amido|maisena|fecula|fécula|chia|linhaça|linhaca|quinoa|aveia|granola|cereal|sucrilhos|corn.flakes|biscoito.cream.cracker|cream.cracker|biscoito.maizena|maizena|biscoito.maisena|bolacha.maizena|torrada|torrada.integral|biscoito.integral|biscoito.doce|biscoito.salgado|pipoca|milho.pipoca|amendoim|castanha|nozes|amêndoa|amendoa|pistache|uva.passa|passas|damasco|ameixa|tâmara|tamara|figo| tâmara|tamara|coco| coco.ralado|leite.de.coco|leite.coco|leite.de.amendoa|leite.amendoa|leite.de.aveia|leite.aveia)\b/.test(
      text,
    )
  )
    return "mercearia";

  return "default";
}

/**
 * Gradiente de cor por categoria (usado no placeholder)
 */
function categoryGradient(category: ProductCategory): string {
  switch (category) {
    case "mercearia":
      return "from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30";
    case "hortifruti":
      return "from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30";
    case "acougue":
      return "from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30";
    case "peixaria":
      return "from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30";
    case "padaria":
      return "from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30";
    case "laticinios":
      return "from-yellow-100 to-yellow-200 dark:from-yellow-900/30 dark:to-yellow-800/30";
    case "bebidas":
      return "from-cyan-100 to-cyan-200 dark:from-cyan-900/30 dark:to-cyan-800/30";
    case "limpeza":
      return "from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30";
    case "higiene":
      return "from-pink-100 to-pink-200 dark:from-pink-900/30 dark:to-pink-800/30";
    case "pet":
      return "from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30";
    case "bazar":
      return "from-slate-100 to-slate-200 dark:from-slate-900/30 dark:to-slate-800/30";
    case "congelados":
      return "from-indigo-100 to-indigo-200 dark:from-indigo-900/30 dark:to-indigo-800/30";
    default:
      return "from-zinc-100 to-zinc-200 dark:from-zinc-800/30 dark:to-zinc-700/30";
  }
}

/**
 * Ícone SVG por categoria (leve, inline)
 */
function CategoryIcon({ category, className = "h-8 w-8" }: { category: ProductCategory; className?: string }) {
  const icons: Record<ProductCategory, React.ReactNode> = {
    mercearia: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    hortifruti: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    acougue: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M12 3v18" />
        <path d="M18 12H6" />
        <path d="M18 6H6" />
        <path d="M18 18H6" />
      </svg>
    ),
    peixaria: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M2 12c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6" />
        <path d="M12 6v12" />
        <path d="M6 12h12" />
        <ellipse cx="12" cy="12" rx="2" ry="2" />
      </svg>
    ),
    padaria: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    laticinios: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M3 3h18v18H3z" />
        <path d="M7 12h10" />
        <path d="M12 7v10" />
      </svg>
    ),
    bebidas: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M8 22h8" />
        <path d="M12 11v11" />
        <path d="M8 11h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2z" />
      </svg>
    ),
    limpeza: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    higiene: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M12 2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
        <path d="M8 10h8" />
        <path d="M8 14h8" />
      </svg>
    ),
    pet: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M12 5c-3 0-6 2-6 5v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-11c0-3-3-5-6-5z" />
        <circle cx="9" cy="10" r="1" fill="currentColor" />
        <circle cx="15" cy="10" r="1" fill="currentColor" />
        <path d="M9 14a3 3 0 1 0 6 0" />
      </svg>
    ),
    bazar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
        <path d="M15 3v18" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
      </svg>
    ),
    congelados: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <path d="M12 2v20" />
        <path d="M6 8l6-6 6 6" />
        <path d="M6 16l6-6 6 6" />
        <path d="M6 12l6-6 6 6" />
      </svg>
    ),
    default: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
        <path d="M15 3v18" />
      </svg>
    ),
  };

  return icons[category] ?? icons.default;
}

/**
 * ProductImage — imagem do produto com fallback ilustrado por categoria + skeleton.
 *
 * @param image_url - URL da imagem real (opcional)
 * @param product - Objeto do produto (para inferir categoria no fallback)
 * @param alt - Alt text (default: nome do produto)
 * @param className - Classes adicionais
 * @param aspect - Aspect ratio: 'square' (mobile cards), 'video' (página produto), 'landscape' (ofertas)
 * @param priority - Se true, carrega com priority (hero images)
 * @param sizes - sizes attribute para Next/Image
 * @param fill - Se true, usa fill (container relativo)
 */
export function ProductImage({
  image_url,
  product,
  alt,
  className,
  aspect = "square",
  priority = false,
  sizes,
  fill = false,
}: {
  image_url: string | null | undefined;
  product?: { name: string; brand?: string | null; category?: string | null } | null;
  alt?: string;
  className?: string;
  aspect?: "square" | "video" | "landscape" | "portrait";
  priority?: boolean;
  sizes?: string;
  fill?: boolean;
}) {
  const category = product ? inferCategory(product) : "default";
  const gradient = categoryGradient(category);

  const aspectClasses = {
    square: "aspect-square",
    video: "aspect-video",
    landscape: "aspect-[4/3]",
    portrait: "aspect-[3/4]",
  }[aspect];

  const defaultSizes = {
    square: "100px",
    video: "100vw",
    landscape: "100vw",
    portrait: "100vw",
  }[aspect];

  const finalSizes = sizes ?? defaultSizes;

  if (image_url) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-muted",
          aspectClasses,
          className,
        )}
        style={fill ? undefined : { width: "100%" }}
      >
        <Image
          src={image_url}
          alt={alt ?? product?.name ?? "Produto"}
          fill={fill}
          sizes={finalSizes}
          priority={priority}
          placeholder="blur"
          blurDataURL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect fill='%23e5e7eb' width='24' height='24'/%3E%3C/svg%3E"
          className="object-cover transition-opacity duration-300"
          style={{ opacity: 1 }}
        />
      </div>
    );
  }

  // Placeholder ilustrado por categoria
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl flex items-center justify-center",
        "bg-gradient-to-br",
        gradient,
        aspectClasses,
        className,
      )}
      style={fill ? undefined : { width: "100%" }}
      aria-hidden="true"
    >
      <CategoryIcon category={category} className="h-12 w-12 sm:h-16 sm:w-16 opacity-60" />
      {/* Overlay sutil de brilho */}
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-transparent" />
    </div>
  );
}

/**
 * ProductImageSkeleton — skeleton animado para loading
 */
export function ProductImageSkeleton({
  aspect = "square",
  className,
}: {
  aspect?: "square" | "video" | "landscape" | "portrait";
  className?: string;
}) {
  const aspectClasses = {
    square: "aspect-square",
    video: "aspect-video",
    landscape: "aspect-[4/3]",
    portrait: "aspect-[3/4]",
  }[aspect];

  return (
    <div className={cn("rounded-xl overflow-hidden", aspectClasses, className)}>
      <div className="shimmer h-full w-full" aria-hidden="true" />
    </div>
  );
}