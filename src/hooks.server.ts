import type { Handle } from '@sveltejs/kit';
import { createServerSupabaseClient } from '$lib/supabase/server';

const LAST_SEEN_COOKIE = 'last_seen_ping';
const LAST_SEEN_TTL_S = 300;

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerSupabaseClient(event.cookies);

  event.locals.getSession = async () => {
    const { data: { user }, error } = await event.locals.supabase.auth.getUser();
    if (error || !user) return null;
    const { data: { session } } = await event.locals.supabase.auth.getSession();
    if (!session) return null;
    return { ...session, user };
  };

  // Record real activity (page loads, SPA data requests, API calls), at most once per LAST_SEEN_TTL_S per browser.
  if (
    !event.cookies.get(LAST_SEEN_COOKIE) &&
    event.cookies.getAll().some((c) => c.name.startsWith('sb-'))
  ) {
    try {
      const { data: { user } } = await event.locals.supabase.auth.getUser();
      if (user) {
        const { error: touchError } = await event.locals.supabase.rpc('touch_last_seen' as any);
        if (touchError) {
          console.error('touch_last_seen failed:', touchError.message);
        } else {
          event.cookies.set(LAST_SEEN_COOKIE, '1', {
            path: '/',
            maxAge: LAST_SEEN_TTL_S,
            httpOnly: true,
            sameSite: 'lax',
            secure: event.url.protocol === 'https:'
          });
        }
      }
    } catch (e) {
      console.error('touch_last_seen threw:', e);
    }
  }

  const response = await resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    }
  });

  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  return response;
};
