import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Recipe } from '$lib/recipes/crud';

export const load: PageServerLoad = async ({ locals, params }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, '/inference/recipe');

  const [recipeResult, recipesResult] = await Promise.all([
    (locals.supabase.from('recipes') as any)
      .select('*')
      .eq('slug', params.slug)
      .single(),
    (locals.supabase.from('recipes') as any)
      .select('id, name, slug, visibility, updated_at, models')
      .eq('owner_id', session.user.id)
      .order('updated_at', { ascending: false }),
  ]);

  const recipe = recipeResult.data as Recipe | null;
  if (recipeResult.error || !recipe || recipe.owner_id !== session.user.id) throw redirect(302, '/inference/recipe');

  return {
    recipe,
    recipes: (recipesResult.data as Recipe[]) ?? [],
    userId: session.user.id,
  };
};
