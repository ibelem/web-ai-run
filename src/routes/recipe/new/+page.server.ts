import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, '/login');

  const { data: recipes } = await (locals.supabase.from('recipes') as any)
    .select('id, name, slug, visibility, updated_at, models')
    .eq('owner_id', session.user.id)
    .order('updated_at', { ascending: false });

  let forkName: string | null = null;
  let forkDescription: string | null = null;
  let forkLinks: any[] = [];
  let forkModels: any[] = [];
  const forkSlug = url.searchParams.get('fork');
  if (forkSlug) {
    const { data: src } = await (locals.supabase.from('recipes') as any)
      .select('name, description, links, models, visibility, owner_id')
      .eq('slug', forkSlug)
      .single();
    if (src && (src.visibility === 'public' || src.owner_id === session.user.id)) {
      forkName = src.name as string;
      forkDescription = (src.description as string | null) ?? null;
      forkLinks = (src.links ?? []) as any[];
      forkModels = (src.models ?? []) as any[];
    }
  }

  return {
    recipes: recipes ?? [],
    userId: session.user.id,
    forkName,
    forkDescription,
    forkLinks,
    forkModels,
  };
};
