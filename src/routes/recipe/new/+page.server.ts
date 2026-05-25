import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, '/login');

  const { data: recipes } = await (locals.supabase.from('recipes') as any)
    .select('id, name, slug, visibility, updated_at, models')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false });

  return {
    recipes: recipes ?? [],
    userId: session.user.id,
  };
};
