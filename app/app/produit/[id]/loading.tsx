import { Skeleton } from '@/components/ui/surface';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement de la fiche produit" className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:gap-10">
      <div className="space-y-6">
        <div className="flex gap-4">
          <Skeleton className="h-28 w-28" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}
