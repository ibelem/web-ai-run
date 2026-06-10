import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import { loginUrl } from '$lib/utils/login-redirect';

export const load: PageLoad = async ({ url }) => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect(302, loginUrl(url.pathname + url.search));
  }
};
