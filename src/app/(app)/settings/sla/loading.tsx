import { TablePageSkeleton } from '@/features/request-config/components/skeletons';

export default function Loading() {
  return <TablePageSkeleton columns={6} rows={10} extra />;
}
