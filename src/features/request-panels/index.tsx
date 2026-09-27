import { CertificateRequestPanel } from '@/features/certificates/components/certificate-request-panel';
import { LeaveRequestPanel } from '@/features/leave/components/leave-request-panel';

/**
 * Request type → type-specific panel on the request details page (extension point —
 * ARCHITECTURE §8). Modules own their panel files; add a case here when a new panel exists.
 */
export function RequestTypePanel({ requestTypeKey, requestId }: { requestTypeKey: string; requestId: string }) {
  switch (requestTypeKey) {
    case 'certificate':
      return <CertificateRequestPanel requestId={requestId} />;
    case 'leave':
      return <LeaveRequestPanel requestId={requestId} />;
    default:
      return null;
  }
}
