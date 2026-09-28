import { TablePageSkeleton } from '@/features/request-config/components/skeletons';

export default function Loading() {
  return <TablePageSkeleton columns={7} rows={10} />;
}
