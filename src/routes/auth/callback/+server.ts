import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loginUrl, safeNext } from '$lib/utils/login-redirect';

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (code) {
    const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user?.user_metadata?.needs_password) {
        redirect(303, '/set-password');
      }
      redirect(303, next);
    }
  }

  // OAuth/code-exchange failed — bounce back to /login but preserve `next`
  // so a successful retry still lands the user on their original page.
  redirect(303, loginUrl(next));
};
