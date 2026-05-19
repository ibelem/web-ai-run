import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) redirect(303, '/');

  if (session.user.app_metadata?.role !== 'admin') {
    error(403, 'Admin access required');
  }

  const { data: models } = await locals.supabase
    .from('models')
    .select('id, hf_model_id, file_path, data_type, runtime, source_org, task, last_synced')
    .order('hf_model_id', { ascending: true });

  return { models: models ?? [] };
};
