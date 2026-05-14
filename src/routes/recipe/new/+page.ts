import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import { redirect } from '@sveltejs/kit';
import type { ModelRow } from '../../model/+page.ts';

export const load: PageLoad = async () => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw redirect(302, '/recipe');

  const { data, error } = await (supabase.from('models') as any)
    .select('id, hf_model_id, file_path, data_type, size_bytes, runtime, source_org, category')
    .order('hf_model_id', { ascending: true });

  return {
    models: (data as ModelRow[]) ?? [],
    userId: session.user.id,
    error: error?.message ?? null,
  };
};
