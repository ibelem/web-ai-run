import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import type { Recipe } from '$lib/recipes/crud';

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  let query = (supabase.from('recipes') as any).select('*');

  if (userId) {
    query = query.or(`owner_id.eq.${userId},visibility.eq.public`);
  } else {
    query = query.eq('visibility', 'public');
  }

  const { data, error } = await query.order('updated_at', { ascending: false });

  return {
    recipes: (data as Recipe[]) ?? [],
    userId: userId ?? null,
    error: error?.message ?? null,
  };
};
