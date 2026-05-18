import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import { loadModels, type FetchMode } from '$lib/model-cache';

export interface ModelRow {
  id: string;
  hf_model_id: string;
  file_path: string;
  data_type: string;
  size_bytes: number;
  runtime: 'onnx' | 'litert';
  source_org: string;
  task: string;
  last_synced: string;
}

export const load: PageLoad = async ({ url }) => {
  const supabase = createClient();

  async function fetchFromSupabase(mode: FetchMode): Promise<ModelRow[]> {
    let query = supabase
      .from('models')
      .select('id, hf_model_id, file_path, data_type, size_bytes, runtime, source_org, task, last_synced')
      .eq('enabled', true)
      .order('hf_model_id', { ascending: true })
      .limit(50000);

    if (!mode.full) {
      query = query.gt('last_synced', mode.since);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as ModelRow[]) ?? [];
  }

  let models: ModelRow[] = [];
  let error: string | null = null;

  try {
    models = await loadModels<ModelRow>(fetchFromSupabase);
  } catch (e: any) {
    error = e.message ?? 'Failed to load models';
  }

  return {
    models,
    error,
    initialSearch: url.searchParams.get('q') ?? '',
  };
};
