'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { NotificationRecord } from '@/components/shell/notification-text';
import { markNotificationsRead } from '../actions';
import { emitNotificationsChanged } from '../categories';

/**
 * Opening a notification: optimistic "read" (caller updates its own list via `onRead`), persist
 * through the server action, tell the header bell, then navigate to the linked record.
 */
export function useOpenNotification(onRead?: (id: string) => void) {
  const router = useRouter();
  return useCallback(
    (n: NotificationRecord) => {
      if (!n.read_at) {
        onRead?.(n.id);
        void markNotificationsRead({ ids: [n.id] })
          .then(() => emitNotificationsChanged())
          .catch(() => emitNotificationsChanged());
      }
      if (n.link && n.link.startsWith('/')) router.push(n.link);
    },
    [onRead, router],
  );
}
