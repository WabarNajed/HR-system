'use client';

import { useCallback, useMemo, useState } from 'react';
import type { NotificationRecord } from '@/components/shell/notification-text';
import { NotificationItem } from './notification-item';
import { useOpenNotification } from './use-open-notification';

/** Compact notification list (dashboard widget). `nowIso` keeps relative times hydration-stable. */
export function NotificationMiniList({ items, nowIso }: { items: NotificationRecord[]; nowIso: string }) {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const markLocal = useCallback((id: string) => setReadIds((prev) => new Set(prev).add(id)), []);
  const open = useOpenNotification(markLocal);
  return (
    <ul className="divide-y divide-border">
      {items.map((n) => (
        <li key={n.id}>
          <NotificationItem
            notification={readIds.has(n.id) && !n.read_at ? { ...n, read_at: nowIso } : n}
            onOpen={open}
            now={now}
            density="compact"
            bodyLines={1}
          />
        </li>
      ))}
    </ul>
  );
}
