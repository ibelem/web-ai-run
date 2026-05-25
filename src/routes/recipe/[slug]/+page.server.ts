import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Recipe } from '$lib/recipes/crud';

export const load: PageServerLoad = async ({ locals, params }) => {
  const session = await locals.getSession();
  const userId = session?.user?.id ?? null;

  const { data, error: dbError } = await (locals.supabase.from('recipes') as any)
    .select('*')
    .eq('slug', params.slug)
    .single();

  const recipe = data as Recipe | null;

  if (dbError || !recipe) {
    throw error(404, 'Recipe not found');
  }

  if (recipe.visibility === 'personal' && recipe.owner_id !== userId) {
    throw error(404, 'Recipe not found');
  }

  return {
    recipe,
    userId,
    isOwner: userId === recipe.owner_id,
  };
};
