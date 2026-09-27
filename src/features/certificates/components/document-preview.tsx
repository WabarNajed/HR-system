'use client';

import { AlertTriangleIcon, DownloadIcon, ExternalLinkIcon, FileTextIcon, LoaderIcon, MonitorIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useErrorMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import type { ActionResult } from '@/lib/action';
import { cn } from '@/lib/utils';
import type { PreviewResult } from '../actions';

const PAPER_WIDTH = 860;

/** Renders an HTML document in a sandboxed iframe scaled to the container width (A4 paper look). */
export function ScaledDocumentFrame({ html, title, className }: { html: string; title: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: PAPER_WIDTH, height: 600 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = Math.min(1, Math.max(0.3, size.width / PAPER_WIDTH));
  return (
    <div ref={ref} className={cn('relative overflow-hidden rounded-md border border-border bg-[#e8edef] dark:bg-[#1b2a30]', className)} dir="ltr">
      <div style={{ width: PAPER_WIDTH * scale, height: size.height }} className="mx-auto overflow-hidden">
        <iframe
          title={title}
          srcDoc={html}
          sandbox=""
          style={{ width: PAPER_WIDTH, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0, display: 'block' }}
        />
      </div>
    </div>
  );
}

function base64ToBlobUrl(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

type Loader = (format: 'html' | 'pdf') => Promise<ActionResult<PreviewResult>>;
type View = 'page' | 'pdf';
type Loaded = { key: string; html?: string; pdfUrl?: string; fileName?: string; error?: string };

/**
 * Preview body with "Page" (HTML, instant) and "PDF" (rendered by Chromium) views. `load` is called
 * again whenever `version` changes (e.g. after the caller's inputs change). Loading state is derived
 * (requested key ≠ loaded key), so effects never set state synchronously.
 */
export function DocumentPreview({
  load,
  version,
  toolbar,
  title,
  frameClassName,
  labels,
}: {
  load: Loader;
  version: number;
  toolbar?: ReactNode;
  title: string;
  frameClassName?: string;
  labels: { page: string; pdf: string; loading: string; failed: string; openInNewTab: string; download: string };
}) {
  const resolve = useErrorMessage();
  const tc = useTranslations('common');
  const [view, setView] = useState<View>('page');
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<Loaded | null>(null);
  const [pdf, setPdf] = useState<Loaded | null>(null);
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const key = `${version}:${attempt}`;

  useEffect(() => {
    const current = view === 'page' ? page : pdf;
    if (current?.key === key) return;
    let cancelled = false;
    const setter = view === 'page' ? setPage : setPdf;
    (async () => {
      let next: Loaded;
      try {
        const result = await loadRef.current(view === 'page' ? 'html' : 'pdf');
        if (!result.ok) next = { key, error: result.error };
        else if (view === 'page' && result.data?.html) next = { key, html: result.data.html };
        else if (view === 'pdf' && result.data?.pdfBase64) next = { key, pdfUrl: base64ToBlobUrl(result.data.pdfBase64), fileName: result.data.fileName };
        else next = { key, error: 'errors.generic' };
      } catch {
        next = { key, error: 'errors.network' };
      }
      if (cancelled) {
        if (next.pdfUrl) URL.revokeObjectURL(next.pdfUrl);
        return;
      }
      setter((prev) => {
        if (prev?.pdfUrl && prev.pdfUrl !== next.pdfUrl) URL.revokeObjectURL(prev.pdfUrl);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [view, key, page, pdf]);

  const current = view === 'page' ? page : pdf;
  const loading = current?.key !== key;
  const error = !loading ? current?.error : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs
          size="sm"
          value={view}
          onValueChange={(v) => setView(v as View)}
          items={[
            { value: 'page', label: labels.page, icon: <MonitorIcon className="size-3.5" /> },
            { value: 'pdf', label: labels.pdf, icon: <FileTextIcon className="size-3.5" /> },
          ]}
          aria-label={title}
        />
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {view === 'pdf' && pdf?.pdfUrl && !loading ? (
            <>
              <Button asChild variant="outline" size="sm">
                <a href={pdf.pdfUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon />
                  {labels.openInNewTab}
                </a>
              </Button>
              <Button asChild size="sm">
                <a href={pdf.pdfUrl} download={pdf.fileName}>
                  <DownloadIcon />
                  {labels.download}
                </a>
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <div className={cn('relative min-h-[24rem] flex-1', frameClassName)}>
        {error ? (
          <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-strong bg-card p-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-warning-soft text-warning">
              <AlertTriangleIcon className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-medium">{labels.failed}</p>
              <p className="text-meta text-muted-foreground">{resolve(error)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)}>
              {tc('retry')}
            </Button>
          </div>
        ) : view === 'page' && page?.html ? (
          <ScaledDocumentFrame html={page.html} title={title} className="h-full" />
        ) : view === 'pdf' && pdf?.pdfUrl ? (
          <iframe title={title} src={pdf.pdfUrl} className="h-full w-full rounded-md border border-border bg-muted" />
        ) : (
          <div className="h-full rounded-md border border-border bg-muted/40" />
        )}
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-[1px]" role="status" aria-live="polite">
            <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-meta font-medium shadow-raised">
              <LoaderIcon className="size-4 animate-spin text-primary" aria-hidden />
              {labels.loading}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
