import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import type { Recipe } from '$lib/recipes/crud';

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect(302, '/login');
  }

  const userId = session.user.id;

  const query = (supabase.from('recipes') as any)
    .select('*')
    .or(`owner_id.eq.${userId},visibility.eq.public`);

  const { data, error } = await query.order('updated_at', { ascending: false });

  return {
    recipes: (data as Recipe[]) ?? [],
    userId,
    error: error?.message ?? null,
  };
};
