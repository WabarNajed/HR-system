import { Forbidden } from '@/components/shared/forbidden';

/** Rendered inside the shell when a page guard calls `forbidden()` (requirePermission / requireRole). */
export default function AppForbidden() {
  return <Forbidden variant="page" />;
}
