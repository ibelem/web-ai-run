import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) return { recipes: [] };

  const { data } = await (locals.supabase.from('recipes') as any)
    .select('id, name, slug, visibility, models, updated_at')
    .eq('kind', 'llm')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  return { recipes: (data ?? []) as any[] };
};
