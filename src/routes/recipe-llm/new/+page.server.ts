import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, '/login');

  const { data: recipes } = await (locals.supabase.from('recipes') as any)
    .select('id, name, slug, visibility, updated_at')
    .eq('kind', 'llm')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false });

  // Fork: pre-load source recipe (public or own)
  let forkName: string | null = null;
  let forkModels: any[] = [];
  const forkSlug = url.searchParams.get('fork');
  if (forkSlug) {
    const { data: src } = await (locals.supabase.from('recipes') as any)
      .select('name, models, visibility, owner_id')
      .eq('kind', 'llm')
      .eq('slug', forkSlug)
      .single();
    if (src && (src.visibility === 'public' || src.owner_id === session.user.id)) {
      forkName = src.name as string;
      forkModels = (src.models ?? []) as any[];
    }
  }

  return { userId: session.user.id, recipes: recipes ?? [], forkName, forkModels };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
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
    if (!Array.isArray(models) || models.length === 0) return { error: 'Add at least one LLM to the recipe' };

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const { error } = await (locals.supabase.from('recipes') as any).insert({
      name, slug, visibility, description,
      models,
      owner_id: session.user.id,
      kind: 'llm',
    });

    if (error) return { error: error.message };
    return { slug };
  },
};
