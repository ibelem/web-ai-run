import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const raw = url.searchParams.get('next') ?? '/';
  const next = (raw.startsWith('/') && !raw.startsWith('//')) ? raw : '/';

  if (code) {
    const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user?.user_metadata?.needs_password) {
        redirect(303, '/set-password');
      }
      redirect(303, next);
    }
  }

  redirect(303, '/login');
};
