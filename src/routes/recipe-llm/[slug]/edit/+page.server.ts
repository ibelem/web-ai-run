import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loginUrl } from '$lib/utils/login-redirect';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, loginUrl(url.pathname + url.search));

  const { data: recipe } = await (locals.supabase.from('recipes') as any)
    .select('*')
    .eq('slug', params.slug)
    .eq('kind', 'llm')
    .single();

  if (!recipe) throw error(404, 'LLM recipe not found');
  if (recipe.owner_id !== session.user.id) throw error(403, 'Not your recipe');

  const { data: recipes } = await (locals.supabase.from('recipes') as any)
    .select('id, name, slug, visibility, updated_at')
    .eq('kind', 'llm')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false });

  return { recipe, recipes: recipes ?? [], userId: session.user.id };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    const session = await locals.getSession();
    if (!session) return { error: 'Not authenticated' };

    const fd = await request.formData();
    const name = (fd.get('name') as string ?? '').trim();
    const visibility = (fd.get('visibility') as string) === 'public' ? 'public' : 'personal';
    const description = (fd.get('description') as string ?? '').trim() || null;
    const modelsJson = fd.get('models') as string;

    if (!name) return { error: 'Recipe name is required' };

    let models: any[];
    try { models = JSON.parse(modelsJson || '[]'); } catch { return { error: 'Invalid models JSON' }; }

    if (models.length === 0) {
      // Empty list → delete recipe
      await (locals.supabase.from('recipes') as any).delete().eq('slug', params.slug).eq('owner_id', session.user.id);
      return { deleted: true };
    }

    const { error: updateError } = await (locals.supabase.from('recipes') as any)
      .update({ name, visibility, description, models, updated_at: new Date().toISOString() })
      .eq('slug', params.slug)
      .eq('owner_id', session.user.id);

    if (updateError) return { error: updateError.message };
    return { saved: true };
  },
};
