import type { ReactNode } from 'react';
import { ClientMessages } from '@/lib/i18n/client-messages';

/** Client message namespaces of this section (ARCHITECTURE §4; checked by `pnpm check:i18n`). */
export default function Layout({ children }: { children: ReactNode }) {
  return <ClientMessages ns={['approvals', 'requests']}>{children}</ClientMessages>;
}
