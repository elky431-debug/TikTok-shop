import { Skeleton } from '@/components/ui/surface';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-8 w-3/4 max-w-md" />
      <Skeleton className="mt-3 h-4 w-2/3 max-w-lg" />
      <div className="mt-8 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-32 rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-6 h-56 w-full rounded-2xl" />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 p-3">
            <Skeleton className="h-[4.5rem] w-[4.5rem]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
