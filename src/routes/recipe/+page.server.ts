import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Recipe } from '$lib/recipes/crud';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();

  if (!session) {
    redirect(302, '/login');
  }

  const userId = session.user.id;

  const query = (locals.supabase.from('recipes') as any)
    .select('*')
    .or(`owner_id.eq.${userId},visibility.eq.public`);

  const { data, error } = await query.order('updated_at', { ascending: false });

  return {
    recipes: (data as Recipe[]) ?? [],
    userId,
    error: error?.message ?? null,
  };
};
