import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="shimmer h-9 w-48" />
      <Skeleton className="shimmer h-12 w-full" />
      <Skeleton className="shimmer h-32 w-full rounded-xl" />
      <Skeleton className="shimmer h-32 w-full rounded-xl" />
    </div>
  );
}
