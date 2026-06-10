import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { isAtLeast } from '$lib/types/roles';
import { loginUrl } from '$lib/utils/login-redirect';

function requireAuth(session: any) {
  if (!session) throw redirect(303, '/login');
  const role = session.user.app_metadata?.role ?? 'anonymous';
  if (!isAtLeast(role, 'member')) throw error(403, 'Login required');
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(303, loginUrl(url.pathname + url.search));
  const role = session.user.app_metadata?.role ?? 'anonymous';
  if (!isAtLeast(role, 'member')) throw error(403, 'Login required');

  const { data, error: dbError } = await (locals.supabase.from('free_dimension_overrides') as any)
    .select('id, hf_model_id, file_path, overrides, updated_by, updated_at, profiles!updated_by(display_name, email, avatar_url)')
    .order('hf_model_id', { ascending: true });

  if (dbError) throw error(500, dbError.message);

  const userId = session.user.id;

  const overrides = (data ?? []).map((r: any) => ({
    id: r.id,
    hf_model_id: r.hf_model_id,
    file_path: r.file_path,
    overrides: r.overrides,
    updated_at: r.updated_at,
    updated_by: r.updated_by,
    updated_by_name: r.profiles?.display_name || r.profiles?.email?.split('@')[0] || null,
    updated_by_avatar: r.profiles?.avatar_url ?? null,
  }));

  return { overrides, role, userId };
};

export const actions: Actions = {
  update: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAuth(session);

    const formData = await request.formData();
    const id = formData.get('id') as string;
    const raw = formData.get('overrides') as string;

    if (!id) return { success: false, error: 'Missing id' };

    const role = session!.user.app_metadata?.role ?? 'member';
    if (!isAtLeast(role, 'intel')) {
      const { data: row } = await (locals.supabase.from('free_dimension_overrides') as any)
        .select('updated_by')
        .eq('id', id)
        .single();
      if (row?.updated_by !== session!.user.id) {
        return { success: false, error: 'You can only edit your own overrides' };
      }
    }

    let parsed: Record<string, number>;
    try {
      parsed = parseOverridesString(raw);
    } catch (e: any) {
      return { success: false, error: e.message };
    }

    const { error: dbError } = await (locals.supabase.from('free_dimension_overrides') as any)
      .update({ overrides: parsed, updated_by: session!.user.id, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (dbError) return { success: false, error: dbError.message };
    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const session = await locals.getSession();
    requireAuth(session);

    const formData = await request.formData();
    const id = formData.get('id') as string;
    if (!id) return { success: false, error: 'Missing id' };

    const role = session!.user.app_metadata?.role ?? 'member';
    if (!isAtLeast(role, 'intel')) {
      const { data: row } = await (locals.supabase.from('free_dimension_overrides') as any)
        .select('updated_by')
        .eq('id', id)
        .single();
      if (row?.updated_by !== session!.user.id) {
        return { success: false, error: 'You can only delete your own overrides' };
      }
    }

    const { error: dbError } = await (locals.supabase.from('free_dimension_overrides') as any)
      .delete()
      .eq('id', id);

    if (dbError) return { success: false, error: dbError.message };
    return { success: true };
  },
};

function parseOverridesString(raw: string): Record<string, number> {
  if (!raw || !raw.trim()) throw new Error('Overrides cannot be empty');
  const result: Record<string, number> = {};
  const pairs = raw.split(',').map(s => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const [key, val] = pair.split(':').map(s => s.trim());
    if (!key) throw new Error(`Invalid pair: "${pair}"`);
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error(`Invalid value for "${key}": must be a positive integer`);
    result[key] = num;
  }
  if (Object.keys(result).length === 0) throw new Error('At least one override is required');
  return result;
}
