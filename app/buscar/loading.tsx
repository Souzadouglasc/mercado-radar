import { Skeleton } from "@/components/ui/skeleton";

export default function BuscarLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="shimmer h-8 w-48" />
      <Skeleton className="shimmer h-10 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="shimmer h-24 w-full" />
        <Skeleton className="shimmer h-24 w-full" />
        <Skeleton className="shimmer h-24 w-full" />
      </div>
    </div>
  );
}
