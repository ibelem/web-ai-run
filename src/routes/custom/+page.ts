import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export const load: PageLoad = async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect(302, '/login');
  }
};
