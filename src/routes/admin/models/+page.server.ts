import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) redirect(303, '/');

  if (session.user.app_metadata?.role !== 'admin') {
    error(403, 'Admin access required');
  }

  const { data: models } = await locals.supabase
    .from('models')
    .select('id, hf_model_id, file_path, data_type, runtime, source_org, category, enabled, last_synced')
    .order('hf_model_id', { ascending: true });

  return { models: models ?? [] };
};

export const actions: Actions = {
  toggleEnabled: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) redirect(303, '/');

    if (session.user.app_metadata?.role !== 'admin') {
      error(403, 'Admin access required');
    }

    const formData = await request.formData();
    const id = formData.get('id') as string;
    const enabled = formData.get('enabled') === 'true';

    if (!id) return { success: false, error: 'Missing id' };

    const { error: updateError } = await locals.supabase
      .from('models')
      .update({ enabled })
      .eq('id', id);

    if (updateError) return { success: false, error: updateError.message };

    return { success: true };
  },
};
