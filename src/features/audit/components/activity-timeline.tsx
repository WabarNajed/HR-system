'use client';

import { FileTextIcon, FileUpIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Timeline, type TimelineItem, type TimelineTone } from '@/components/shared/timeline';
import { Badge } from '@/components/ui/badge';
import type { AuditEventView } from '../types';
import { AuditDetailsSheet, parseChanges, TONE_BADGE } from './audit-details-sheet';
import { auditIcon } from './audit-visuals';

/** Audit timeline for HR / auditors: each event opens the same details drawer as the audit log. */
export function AuditActivityTimeline({ events }: { events: AuditEventView[] }) {
  const t = useTranslations('audit');
  const [selected, setSelected] = useState<AuditEventView | null>(null);
  const items: TimelineItem[] = events.map((e) => {
    const changed = parseChanges(e.changes).filter((c) => c.kind === 'diff').length;
    return {
      id: String(e.id),
      icon: auditIcon(e.action),
      tone: e.tone as TimelineTone,
      time: e.createdAt,
      title: (
        <button
          type="button"
          onClick={() => setSelected(e)}
          className="text-start font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-4 focus-visible:underline focus-visible:outline-none"
        >
          {e.actionLabel}
        </button>
      ),
      actor: e.actor.name || e.actor.email ? t('activity.by', { name: e.actor.name || e.actor.email || '' }) : t('system'),
      description: e.summary ? (
        <span className="line-clamp-2 break-words">
          <bdi>{e.summary}</bdi>
        </span>
      ) : undefined,
      content:
        changed > 0 ? (
          <Badge variant={TONE_BADGE[e.tone]} size="sm">
            {t('activity.changedFields', { count: changed })}
          </Badge>
        ) : undefined,
    };
  });
  return (
    <>
      <Timeline items={items} dense />
      <AuditDetailsSheet event={selected} onOpenChange={(open) => (!open ? setSelected(null) : undefined)} />
    </>
  );
}

export type SelfActivityItem = {
  id: string;
  kind: 'request' | 'document';
  title: string;
  description: string | null;
  time: string;
  tone: TimelineTone;
  href: string | null;
};

const SELF_ICONS: Record<SelfActivityItem['kind'], LucideIcon> = { request: FileTextIcon, document: FileUpIcon };

/** Reduced "your recent activity" (own request history and documents — rows RLS lets the employee read). */
export function SelfActivityTimeline({ items }: { items: SelfActivityItem[] }) {
  const timeline: TimelineItem[] = items.map((i) => ({
    id: i.id,
    icon: SELF_ICONS[i.kind],
    tone: i.tone,
    time: i.time,
    title: i.href ? (
      <Link href={i.href} className="hover:text-primary hover:underline hover:underline-offset-4">
        {i.title}
      </Link>
    ) : (
      i.title
    ),
    description: i.description ?? undefined,
  }));
  return <Timeline items={timeline} dense />;
}
