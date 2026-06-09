import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Recipe } from '$lib/recipes/crud';

export interface RecipeWithOwner extends Recipe {
  owner_display_name: string | null;
  owner_avatar_url: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();

  if (!session) {
    redirect(302, '/login');
  }

  const userId = session.user.id;

  const { data, error } = await (locals.supabase.from('recipes') as any)
    .select('*, profiles!owner_id(display_name, email, avatar_url)')
    .neq('kind', 'llm')
    .or(`owner_id.eq.${userId},visibility.eq.public`)
    .order('updated_at', { ascending: false });

  const recipes: RecipeWithOwner[] = (data ?? []).map((r: any) => ({
    ...r,
    owner_display_name: r.profiles?.display_name || r.profiles?.email?.split('@')[0] || null,
    owner_avatar_url: r.profiles?.avatar_url ?? null,
    profiles: undefined,
  }));

  return {
    recipes,
    userId,
    error: error?.message ?? null,
  };
};
