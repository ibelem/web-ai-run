import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) redirect(303, '/');
  if (session.user.app_metadata?.role !== 'admin') error(403, 'Admin access required');

  const { data: orgs } = await locals.supabase
    .from('orgs')
    .select('*')
    .order('name', { ascending: true });

  return { orgs: orgs ?? [] };
};

export const actions: Actions = {
  add: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) redirect(303, '/');
    if (session.user.app_metadata?.role !== 'admin') error(403, 'Admin access required');

    const fd = await request.formData();
    const name = (fd.get('name') as string)?.trim();

    if (!name) return { success: false, error: 'Name is required' };

    const { error: err } = await locals.supabase
      .from('orgs')
      .insert({ name });

    if (err) return { success: false, error: err.message };
    return { success: true };
  },

  update: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) redirect(303, '/');
    if (session.user.app_metadata?.role !== 'admin') error(403, 'Admin access required');

    const fd = await request.formData();
    const id = fd.get('id') as string;
    const name = (fd.get('name') as string)?.trim();

    if (!id || !name) return { success: false, error: 'Missing fields' };

    const { error: err } = await locals.supabase
      .from('orgs')
      .update({ name })
      .eq('id', id);

    if (err) return { success: false, error: err.message };
    return { success: true };
  },

  remove: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) redirect(303, '/');
    if (session.user.app_metadata?.role !== 'admin') error(403, 'Admin access required');

    const fd = await request.formData();
    const id = fd.get('id') as string;

    if (!id) return { success: false, error: 'Missing id' };

    const { error: err } = await locals.supabase
      .from('orgs')
      .delete()
      .eq('id', id);

    if (err) return { success: false, error: err.message };
    return { success: true };
  },
};
