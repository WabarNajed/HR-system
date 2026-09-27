import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * Request-details panel for `leave` requests (extension point — ARCHITECTURE §8), mapped in
 * `features/request-panels/index.tsx`. Stub: the leave module replaces it.
 */
export async function LeaveRequestPanel({ requestId }: { requestId: string }) {
  return <ScaffoldPlaceholder module="leave.request-panel" key={requestId} />;
}
