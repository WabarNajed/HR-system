import 'server-only';

import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import type { SessionContext } from '@/lib/auth/session';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { checkAccess, type AccessRule } from '@/lib/permissions';
import {
  auditActionLabel,
  auditCategory,
  auditEntityHref,
  auditEntityLabel,
  auditTone,
  routePattern,
  splitAction,
  type AuditTranslator,
} from './labels';
import type { ActorProfile, AuditRow } from './queries';
import { auditSummary, type AuditSummaryLookups } from './summary';
import type { AuditEventView } from './types';

/** True when the viewer may open `href` (route rules from nav-config). */
export function canOpenHref(ctx: SessionContext, href: string): boolean {
  const rule = (ROUTE_ACCESS as Record<string, AccessRule>)[routePattern(href)];
  return rule ? checkAccess(ctx, rule) : false;
}

/** Resolves labels, tone and permitted links of an audit row for the client. */
export function toAuditView(
  row: AuditRow,
  ctx: SessionContext,
  t: AuditTranslator,
  actors: Map<string, ActorProfile>,
  lookups: AuditSummaryLookups = {},
): AuditEventView {
  const href = auditEntityHref(row);
  const employeeHref = row.employee_id ? `/employees/${row.employee_id}` : null;
  const actor = row.actor_id ? actors.get(row.actor_id) : undefined;
  const actorName = actor ? employeeDisplayName(actor.employee, ctx.locale) || actor.full_name || null : null;
  const entityType = row.entity_type ?? splitAction(row.action).entity;
  return {
    id: Number(row.id),
    createdAt: row.created_at,
    action: row.action,
    actionLabel: auditActionLabel(t, row.action),
    category: auditCategory(row.action),
    tone: auditTone(row.action),
    entityType,
    entityLabel: auditEntityLabel(t, entityType),
    entityId: row.entity_id,
    href: href && canOpenHref(ctx, href) ? href : null,
    employeeId: row.employee_id,
    employeeHref: employeeHref && canOpenHref(ctx, employeeHref) ? employeeHref : null,
    summary: auditSummary(t, row, ctx.locale, lookups),
    actor: { id: row.actor_id, name: actorName, email: row.actor_email ?? actor?.email ?? null },
    changes: row.changes ?? null,
    ip: row.ip,
    userAgent: row.user_agent,
  };
}
