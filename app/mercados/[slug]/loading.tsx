import { Skeleton } from "@/components/ui/skeleton";

export default function MercadoLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="shimmer h-8 w-56" />
      <div className="flex flex-col gap-3">
        <Skeleton className="shimmer h-24 w-full" />
        <Skeleton className="shimmer h-24 w-full" />
        <Skeleton className="shimmer h-24 w-full" />
      </div>
    </div>
  );
}
