import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export const load: PageLoad = async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { recipes: [] };

  const { data } = await (supabase.from('recipes') as any)
    .select('id, name, slug, visibility, models, updated_at')
    .eq('kind', 'llm')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  return { recipes: (data ?? []) as any[] };
};
