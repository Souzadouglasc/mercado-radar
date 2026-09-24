import { Skeleton } from "@/components/ui/skeleton";

export default function ProdutoLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex gap-3">
        <Skeleton className="shimmer h-24 w-24 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="shimmer h-7 w-3/4" />
          <Skeleton className="shimmer h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="shimmer h-40 w-full rounded-xl" />
      <Skeleton className="shimmer h-64 w-full rounded-xl" />
    </div>
  );
}
