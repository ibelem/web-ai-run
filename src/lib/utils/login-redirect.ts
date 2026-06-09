// Helpers for "redirect to original page after login" flow.
//
// All protected pages should redirect unauthenticated users to
//   /login?next=<encoded current url>
// The /login page and /auth/callback consume `next` and route the user back
// after a successful sign-in. `next` is always validated as same-origin to
// avoid being abused as an open redirect.

const STORAGE_KEY = 'login_next';

/** Build a same-origin path+search+hash string from a URL or location-like object. */
export function locationPath(loc: { pathname: string; search?: string; hash?: string }): string {
  return `${loc.pathname}${loc.search ?? ''}${loc.hash ?? ''}`;
}

/**
 * Validate `next` is a same-origin app path. Anything else (absolute URL,
 * protocol-relative `//evil.com`, missing leading slash) falls back to '/'.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}

/** Build the login URL with the current location encoded as `next`. */
export function loginUrl(currentPath: string): string {
  const safe = safeNext(currentPath);
  if (safe === '/') return '/login';
  return `/login?next=${encodeURIComponent(safe)}`;
}

/** Extract `next` from a URL's query string, validated. */
export function readNextFromUrl(url: URL | { searchParams: URLSearchParams }): string {
  return safeNext(url.searchParams.get('next'));
}

/**
 * OAuth round-trips through the provider, so we stash `next` in sessionStorage
 * and consume it on /auth/callback (which already accepts ?next= as well).
 */
export function stashNext(next: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(STORAGE_KEY, safeNext(next)); } catch {}
}

export function popStashedNext(): string {
  if (typeof sessionStorage === 'undefined') return '/';
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) sessionStorage.removeItem(STORAGE_KEY);
    return safeNext(raw);
  } catch {
    return '/';
  }
}
