import { createClient } from '$lib/supabase/client';
import type { RecipeModel } from '$lib/supabase/types';

export interface Recipe {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  visibility: 'personal' | 'public';
  featured: boolean;
  featured_order: number | null;
  description: string | null;
  links: { label?: string; url: string }[];
  models: RecipeModel[];
  created_at: string;
  updated_at: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function listRecipes(userId?: string): Promise<Recipe[]> {
  const supabase = createClient();

  let query = (supabase.from('recipes') as any).select('*');

  if (userId) {
    query = query.or(`owner_id.eq.${userId},visibility.eq.public`);
  } else {
    query = query.eq('visibility', 'public');
  }

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Recipe[]) ?? [];
}

export async function listMyRecipes(userId: string): Promise<Recipe[]> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('recipes') as any)
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Recipe[]) ?? [];
}

export async function getRecipe(slug: string): Promise<Recipe | null> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('recipes') as any)
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) return null;
  return data as Recipe;
}

export async function createRecipe(
  ownerId: string,
  name: string,
  models: RecipeModel[],
  visibility: 'personal' | 'public' = 'personal',
  description?: string | null,
  links?: { label?: string; url: string }[]
): Promise<Recipe> {
  const supabase = createClient();
  const slug = `${slugify(name)}-${Date.now().toString(36)}`;

  const { data, error } = await (supabase.from('recipes') as any)
    .insert({
      owner_id: ownerId,
      name,
      slug,
      visibility,
      models,
      ...(description ? { description } : {}),
      ...(links?.length ? { links } : {}),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as Recipe;
}

export async function updateRecipe(
  id: string,
  updates: {
    name?: string;
    models?: RecipeModel[];
    visibility?: 'personal' | 'public';
    description?: string | null;
    links?: { label?: string; url: string }[];
  }
): Promise<Recipe> {
  const supabase = createClient();
  const { data, error } = await (supabase.from('recipes') as any)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as Recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await (supabase.from('recipes') as any).delete().eq('id', id);
  if (error) throw new Error(error.message);
}
