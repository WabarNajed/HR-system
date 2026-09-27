import type { AuditCategory, AuditTone } from './labels';

/** Audit event prepared on the server for the client table / details sheet (labels resolved). */
export type AuditEventView = {
  id: number;
  createdAt: string;
  action: string;
  actionLabel: string;
  category: AuditCategory | null;
  tone: AuditTone;
  entityType: string | null;
  entityLabel: string;
  entityId: string | null;
  /** Route of the concerned record — only when the viewer may open it. */
  href: string | null;
  employeeId: string | null;
  /** `/employees/<id>` — only when the viewer may open it. */
  employeeHref: string | null;
  summary: string | null;
  actor: { id: string | null; name: string | null; email: string | null };
  changes: unknown;
  ip: string | null;
  userAgent: string | null;
};
