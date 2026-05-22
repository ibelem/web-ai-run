import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import { redirect } from '@sveltejs/kit';
import { getRecipe } from '$lib/recipes/crud';
import type { ModelRow } from '../../../model/+page.ts';

export const load: PageLoad = async ({ params }) => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw redirect(302, '/recipe');

  const recipe = await getRecipe(params.slug);
  if (!recipe || recipe.owner_id !== session.user.id) throw redirect(302, '/recipe');

  const [modelsResult, recipesResult] = await Promise.all([
    (supabase.from('models') as any)
      .select('id, hf_model_id, file_path, data_type, size_bytes, runtime, source_org, task')
      .order('hf_model_id', { ascending: true }),
    (supabase.from('recipes') as any)
      .select('id, name, slug, visibility, updated_at, models')
      .eq('owner_id', session.user.id)
      .order('updated_at', { ascending: false }),
  ]);

  return {
    recipe,
    models: (modelsResult.data as ModelRow[]) ?? [],
    recipes: (recipesResult.data as import('$lib/recipes/crud').Recipe[]) ?? [],
    userId: session.user.id,
    error: modelsResult.error?.message ?? null,
  };
};
