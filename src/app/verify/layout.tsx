import type { ReactNode } from 'react';
import { ClientMessages } from '@/lib/i18n/client-messages';

/** Public certificate verification: its client island needs the `verify` messages (ARCHITECTURE §4). */
export default function VerifyLayout({ children }: { children: ReactNode }) {
  return <ClientMessages ns={['verify']}>{children}</ClientMessages>;
}
