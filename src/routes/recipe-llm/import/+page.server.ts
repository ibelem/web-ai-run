import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, '/login');

  const { data: recipes } = await (locals.supabase.from('recipes') as any)
    .select('id, name, slug, models')
    .eq('kind', 'llm')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false });

  return {
    userId: session.user.id,
    myRecipes: ((recipes as any[]) ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      modelCount: Array.isArray(r.models) ? r.models.length : 0,
    })),
  };
};

export const actions: Actions = {
  import: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) return { error: 'Not authenticated' };

    const fd = await request.formData();
    const json = (fd.get('json') as string ?? '').trim();

    let payload: any;
    try { payload = JSON.parse(json); } catch { return { error: 'Invalid JSON' }; }

    const name = payload?.name ?? payload?.recipe?.name;
    const models = payload?.models ?? payload?.recipe?.models ?? [];
    const description = payload?.description ?? payload?.recipe?.description ?? null;
    const visibility = payload?.visibility === 'public' ? 'public' : 'personal';

    if (!name) return { error: 'Missing recipe name in JSON' };
    if (!Array.isArray(models) || models.length === 0) return { error: 'No models found in JSON' };

    for (const m of models) {
      if (!m.hf_model_id || !m.data_type) return { error: `Invalid model entry: ${JSON.stringify(m)}` };
    }

    const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const { data, error } = await (locals.supabase.from('recipes') as any).insert({
      name: String(name), slug, visibility, description: description ? String(description) : null,
      models, owner_id: session.user.id, kind: 'llm',
    }).select('slug').single();

    if (error) return { error: error.message };
    return { slug: data.slug };
  },

  merge: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) return { error: 'Not authenticated' };

    const fd = await request.formData();
    const recipeId = (fd.get('recipeId') as string ?? '').trim();
    const json = (fd.get('json') as string ?? '').trim();

    if (!recipeId) return { error: 'No recipe selected.' };

    let payload: any;
    try { payload = JSON.parse(json); } catch { return { error: 'Invalid JSON' }; }

    const newModels = payload?.models ?? payload?.recipe?.models ?? [];
    if (!Array.isArray(newModels) || newModels.length === 0) return { error: 'No models found in JSON' };

    for (const m of newModels) {
      if (!m.hf_model_id || !m.data_type) return { error: `Invalid model entry: ${JSON.stringify(m)}` };
    }

    const { data: recipe, error: loadError } = await (locals.supabase.from('recipes') as any)
      .select('id, owner_id, slug, models')
      .eq('id', recipeId)
      .single();

    if (loadError || !recipe) return { error: 'Recipe not found.' };
    if ((recipe as any).owner_id !== session.user.id) return { error: 'Not your recipe.' };

    const existing: any[] = (recipe as any).models ?? [];
    const toAdd: any[] = [];
    let skipped = 0;

    for (const m of newModels) {
      const isDupe = existing.some(
        (e) => e.hf_model_id === m.hf_model_id && e.data_type === m.data_type
      );
      if (isDupe) skipped++;
      else toAdd.push(m);
    }

    if (toAdd.length > 0) {
      const { error: updateError } = await (locals.supabase.from('recipes') as any)
        .update({ models: [...existing, ...toAdd] })
        .eq('id', recipeId);
      if (updateError) return { error: updateError.message };
    }

    return { success: true, added: toAdd.length, skipped, slug: (recipe as any).slug };
  },
};
