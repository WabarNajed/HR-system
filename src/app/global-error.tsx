'use client';

import arErrors from '../../locales/ar/errors.json';
import arCommon from '../../locales/ar/common.json';
import enErrors from '../../locales/en/errors.json';
import enCommon from '../../locales/en/common.json';
import './globals.css';

/**
 * Last-resort boundary when the root layout itself fails (no providers available). Renders both
 * languages from the static catalogs and a plain reload button.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <main className="flex min-h-dvh items-center justify-center bg-background p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-raised">
            <h1 className="text-base font-semibold" lang="ar">
              {arErrors.pageErrorTitle}
            </h1>
            <p className="mt-1 text-meta text-muted-foreground" lang="ar">
              {arErrors.pageErrorDescription}
            </p>
            <div className="my-5 h-px bg-border" />
            <h2 className="text-base font-semibold" lang="en" dir="ltr">
              {enErrors.pageErrorTitle}
            </h2>
            <p className="mt-1 text-meta text-muted-foreground" lang="en" dir="ltr">
              {enErrors.pageErrorDescription}
            </p>
            {error.digest ? (
              <p className="mt-4 text-xs text-faint-foreground">
                <span lang="ar">{arErrors.errorReferenceRich.split('<ref>')[0]}</span>{' '}
                <bdi dir="ltr" className="font-mono select-all">
                  {error.digest}
                </bdi>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {arCommon.tryAgain} · {enCommon.tryAgain}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
