import { DataTableSkeleton } from '@/components/data-table';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <KpiGrid count={4}>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </KpiGrid>
      <DataTableSkeleton columns={6} rows={8} />
    </div>
  );
}
