import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface ModelRow {
  id: string;
  hf_model_id: string;
  file_path: string;
  data_type: string;
  size_bytes: number;
  runtime: 'onnx' | 'litert';
  source_org: string;
  category: string;
}

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('models')
    .select('id, hf_model_id, file_path, data_type, size_bytes, runtime, source_org, category')
    .order('hf_model_id', { ascending: true });

  const models: ModelRow[] = (data as ModelRow[]) ?? [];

  return {
    models,
    error: error?.message ?? null,
  };
};
