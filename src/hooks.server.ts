import type { Handle } from '@sveltejs/kit';
import { createServerSupabaseClient } from '$lib/supabase/server';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerSupabaseClient(event.cookies);

  event.locals.getSession = async () => {
    const { data: { session } } = await event.locals.supabase.auth.getSession();
    if (!session) return null;
    const { data: { user }, error } = await event.locals.supabase.auth.getUser();
    if (error || !user) return null;
    return { ...session, user };
  };

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
