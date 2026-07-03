import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { SharedRunConfig } from '$lib/supabase/types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { data, error: dbError } = await (locals.supabase.from('shared_configs') as any)
    .select('config')
    .eq('id', params.id)
    .single();

  if (dbError || !data) throw error(404, 'Shared configuration not found');

  const config = data.config as SharedRunConfig;

  const hash = new URLSearchParams();
  if (config.models.length) {
    hash.set('models', config.models.map(m => `${m.hf_model_id}|${m.file_path}`).join(','));
  }
  if (config.backends.length) {
    hash.set('backend', config.backends.join(','));
  }
  hash.set('n', String(config.iterations ?? 50));
  if (config.upload) hash.set('upload', '1');
  if (config.cpu) hash.set('cpu', config.cpu);
  if (config.os) hash.set('os', config.os);
  if (config.ort) hash.set('ort', config.ort);
  if (config.litert) hash.set('litert', config.litert);
  if (config.webnn_ep) hash.set('webnn_ep', config.webnn_ep);
  if (config.fdo === false) hash.set('fdo', '0');

  throw redirect(302, `/inference/run#${hash}`);
};
