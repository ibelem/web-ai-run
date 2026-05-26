import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

function requireAdmin(session: any) {
  if (!session) throw redirect(303, '/');
  if (session.user.app_metadata?.role !== 'admin') throw error(403, 'Admin access required');
}

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  requireAdmin(session);

  const { data, error: dbError } = await (locals.supabase.from('recipes') as any)
    .select('*, profiles!owner_id(display_name, email, avatar_url)')
    .eq('visibility', 'public')
    .order('featured_order', { ascending: true, nullsFirst: false });

  if (dbError) throw error(500, dbError.message);

  const recipes = (data ?? []).map((r: any) => ({
    ...r,
    owner_display_name: r.profiles?.display_name || r.profiles?.email?.split('@')[0] || null,
    owner_avatar_url: r.profiles?.avatar_url ?? null,
    profiles: undefined,
  }));

  return { recipes };
};

export const actions: Actions = {
  featureRecipe: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAdmin(session);

    const formData = await request.formData();
    const id = formData.get('id') as string;
    if (!id) return { success: false, error: 'Missing id' };

    // Append to end: max(featured_order) + 10
    const { data: maxRow } = await (locals.supabase.from('recipes') as any)
      .select('featured_order')
      .eq('featured', true)
      .order('featured_order', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    const nextOrder = ((maxRow?.featured_order as number | null) ?? 0) + 10;

    const { error: dbError } = await (locals.supabase.from('recipes') as any)
      .update({ featured: true, featured_order: nextOrder })
      .eq('id', id);

    if (dbError) return { success: false, error: dbError.message };
    return { success: true };
  },

  unfeatureRecipe: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAdmin(session);

    const formData = await request.formData();
    const id = formData.get('id') as string;
    if (!id) return { success: false, error: 'Missing id' };

    const { error: dbError } = await (locals.supabase.from('recipes') as any)
      .update({ featured: false, featured_order: null })
      .eq('id', id);

    if (dbError) return { success: false, error: dbError.message };
    return { success: true };
  },

  updateOrder: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAdmin(session);

    const formData = await request.formData();
    const id = formData.get('id') as string;
    const orderRaw = formData.get('order') as string;
    const order = parseInt(orderRaw, 10);

    if (!id || isNaN(order) || order < 1) return { success: false, error: 'Invalid input' };

    const { error: dbError } = await (locals.supabase.from('recipes') as any)
      .update({ featured_order: order })
      .eq('id', id);

    if (dbError) return { success: false, error: dbError.message };
    return { success: true };
  },
};
