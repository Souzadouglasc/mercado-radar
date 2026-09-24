import { Skeleton } from "@/components/ui/skeleton";

export default function ListaLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="shimmer h-8 w-48" />
      <Skeleton className="shimmer h-12 w-full rounded-xl" />
      <Skeleton className="shimmer h-28 w-full rounded-xl" />
      <Skeleton className="shimmer h-24 w-full rounded-xl" />
    </div>
  );
}
