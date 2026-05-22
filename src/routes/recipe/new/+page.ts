import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw redirect(302, '/login');

  const { data: recipes } = await (supabase.from('recipes') as any)
    .select('id, name, slug, visibility, updated_at, models')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false });

  return {
    recipes: recipes ?? [],
    userId: session.user.id,
  };
};
