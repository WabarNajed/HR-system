import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * Request-details panel for `certificates` requests (extension point — ARCHITECTURE §8), mapped in
 * `features/request-panels/index.tsx`. Stub: the certificates module replaces it.
 */
export async function CertificateRequestPanel({ requestId }: { requestId: string }) {
  return <ScaffoldPlaceholder module="certificates.request-panel" key={requestId} />;
}
