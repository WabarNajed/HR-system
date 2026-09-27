/**
 * Small HTTP helpers for route handlers.
 */

/** `attachment; filename="<ascii fallback>"; filename*=UTF-8''<RFC 5987>` — safe for Arabic names. */
export function contentDisposition(fileName: string, disposition: 'attachment' | 'inline' = 'attachment'): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Plain-text response with no caching. */
export function plainText(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
