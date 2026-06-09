import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loginUrl } from '$lib/utils/login-redirect';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, loginUrl(url.pathname + url.search));

  const { data: recipe } = await (locals.supabase.from('recipes') as any)
    .select('*, profiles!owner_id(display_name, email, avatar_url)')
    .eq('slug', params.slug)
    .eq('kind', 'llm')
    .single();

  if (!recipe) throw error(404, 'LLM recipe not found');

  return {
    recipe: {
      ...recipe,
      owner_display_name: recipe.profiles?.display_name || recipe.profiles?.email?.split('@')[0] || null,
      owner_avatar_url: recipe.profiles?.avatar_url ?? null,
    },
    userId: session.user.id,
  };
};
