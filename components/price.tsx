import { formatPriceBRL } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Price({
  value,
  size = "md",
  className,
}: {
  value: number;
  size?: "md" | "lg";
  className?: string;
}) {
  return <span className={cn(size === "lg" ? "price-lg" : "price", className)}>{formatPriceBRL(value)}</span>;
}
