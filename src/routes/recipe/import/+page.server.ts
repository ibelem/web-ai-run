import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { RecipeModel } from '$lib/supabase/types';
import { inferDataType } from '$lib/huggingface/parser';
import { loginUrl } from '$lib/utils/login-redirect';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, loginUrl(url.pathname + url.search));

  const { data, error: dbError } = await (locals.supabase.from('recipes') as any)
    .select('id, name, slug, models')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false });

  if (dbError) throw error(500, dbError.message);

  return {
    myRecipes: ((data as any[]) ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      modelCount: (r.models as any[]).length,
    })),
  };
};

export const actions: Actions = {
  createRecipe: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw redirect(302, '/login');

    const formData = await request.formData();
    const name = (formData.get('name') as string | null)?.trim();
    if (!name) return fail(400, { error: 'Recipe name is required.' });

    const visibility = (formData.get('visibility') as string) === 'public' ? 'public' : 'personal';
    const description = (formData.get('description') as string | null)?.trim() || null;

    let links: { label?: string; url: string }[] = [];
    try {
      links = JSON.parse((formData.get('links') as string) || '[]');
    } catch {
      links = [];
    }

    let models: RecipeModel[] = [];
    try {
      models = JSON.parse((formData.get('models') as string) || '[]');
    } catch {
      return fail(400, { error: 'Invalid models data.' });
    }

    for (const m of models) {
      if (!m.hf_model_id || !m.file_path) {
        return fail(400, { error: 'Each model must have hf_model_id and file_path.' });
      }
      m.data_type = inferDataType(m.file_path);
    }

    if (models.length === 0) return fail(400, { error: 'At least one model is required.' });

    const blocked = models.filter((m) => /\.(litertlm|task)$/i.test(m.file_path));
    if (blocked.length > 0) {
      return fail(400, {
        error: `LLM benchmark coming soon — cannot import recipe with ${blocked.length} .litertlm/.task model(s) yet.`,
      });
    }

    const slug = `${slugify(name)}-${Date.now().toString(36)}`;

    const { data, error: dbError } = await (locals.supabase.from('recipes') as any)
      .insert({ owner_id: session.user.id, name, slug, visibility, models, description, links })
      .select('slug')
      .single();

    if (dbError) return fail(500, { error: dbError.message });

    throw redirect(302, `/recipe/${(data as any).slug}`);
  },

  mergeRecipe: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw redirect(302, '/login');

    const formData = await request.formData();
    const recipeId = formData.get('recipeId') as string | null;
    if (!recipeId) return fail(400, { error: 'No recipe selected.' });

    let newModels: RecipeModel[] = [];
    try {
      newModels = JSON.parse((formData.get('models') as string) || '[]');
    } catch {
      return fail(400, { error: 'Invalid models data.' });
    }

    if (newModels.length === 0) return fail(400, { error: 'At least one model is required.' });

    const { data: recipe, error: loadError } = await (locals.supabase.from('recipes') as any)
      .select('id, owner_id, slug, models')
      .eq('id', recipeId)
      .single();

    if (loadError || !recipe) return fail(404, { error: 'Recipe not found.' });
    if ((recipe as any).owner_id !== session.user.id) return fail(403, { error: 'Not your recipe.' });

    const existing: RecipeModel[] = (recipe as any).models ?? [];
    const toAdd: RecipeModel[] = [];
    let skipped = 0;

    for (const m of newModels) {
      m.data_type = inferDataType(m.file_path);
      const isDupe = existing.some(
        (e) => e.hf_model_id === m.hf_model_id && e.file_path === m.file_path
      );
      if (isDupe) {
        skipped++;
      } else {
        toAdd.push(m);
      }
    }

    if (toAdd.length > 0) {
      const { error: updateError } = await (locals.supabase.from('recipes') as any)
        .update({ models: [...existing, ...toAdd] })
        .eq('id', recipeId);

      if (updateError) return fail(500, { error: updateError.message });
    }

    return { success: true, added: toAdd.length, skipped, slug: (recipe as any).slug };
  },
};
