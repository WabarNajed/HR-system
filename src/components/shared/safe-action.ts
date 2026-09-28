'use client';

/**
 * Client-side guard for Server Action calls.
 *
 * A Server Action that fails at the transport level (offline, proxy timeout, server restart, a 5xx
 * with a non-RSC body, or deployment skew — "Failed to find Server Action") *throws* on the client.
 * Inside `startTransition(async () => …)` that throw reaches the route error boundary, which unmounts
 * the page — the open dialog and the user's input are lost and no toast is shown.
 *
 *   startTransition(async () => {
 *     const result = await safeAction(() => saveThing(values));   // never throws
 *     if (!result.ok) return void toast.error(resolve(result.error)); // dialog stays open
 *     …
 *   });
 *
 * The failure is returned as a regular `ActionResult` failure whose `error` is an i18n key
 * (`errors.offline` / `errors.network` / `errors.stale` / `errors.serverError` / `errors.generic`),
 * so the caller's existing `!result.ok` branch handles it. Next.js control-flow errors (redirect /
 * notFound / forbidden) are re-thrown untouched.
 */

export type SafeActionFailure = { ok: false; error: ActionTransportErrorKey; fieldErrors?: undefined };

export type ActionTransportErrorKey =
  | 'errors.offline'
  | 'errors.network'
  | 'errors.stale'
  | 'errors.serverError'
  | 'errors.generic';

/** True for Next.js control-flow errors that must keep propagating (redirect, notFound, …). */
function isNavigationError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK') || digest === 'NEXT_NOT_FOUND');
}

/** Maps a thrown Server Action / fetch error to an i18n key (never exposes the raw message). */
export function actionErrorKey(error: unknown): ActionTransportErrorKey {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'errors.offline';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/server action/i.test(message)) return 'errors.stale';
  // fetch() rejects with a TypeError on network failure (Chrome "Failed to fetch", Firefox
  // "NetworkError…", Safari "Load failed"); aborted/timed-out requests reject with an AbortError.
  if (error instanceof TypeError || (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
    return 'errors.network';
  }
  // Next.js E394: the action endpoint answered with a non-RSC body (e.g. a 5xx from a proxy).
  if ((error as { __NEXT_ERROR_CODE?: unknown } | null)?.__NEXT_ERROR_CODE === 'E394') return 'errors.serverError';
  return 'errors.generic';
}

/** Awaits `call()`; a thrown transport/server error becomes `{ ok: false, error: <i18n key> }`. */
export async function safeAction<T>(call: () => Promise<T>): Promise<T | SafeActionFailure> {
  try {
    return await call();
  } catch (error) {
    if (isNavigationError(error)) throw error;
    if (process.env.NODE_ENV !== 'production') console.error(error);
    return { ok: false, error: actionErrorKey(error) };
  }
}

/**
 * Strict check used by the route error boundary: the error was thrown on the client by a failed
 * Server Action request (not a render bug, not a server render error — those carry a `digest`).
 * Returns the i18n key to show, or `null`.
 */
export function transportErrorKey(error: unknown): ActionTransportErrorKey | null {
  if (!error || typeof error !== 'object' || (error as { digest?: unknown }).digest) return null;
  const message = error instanceof Error ? error.message : '';
  if (/server action/i.test(message)) return 'errors.stale';
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false ? 'errors.offline' : 'errors.network';
  }
  if ((error as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE === 'E394') return 'errors.serverError';
  return null;
}
