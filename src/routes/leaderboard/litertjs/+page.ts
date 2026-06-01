import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface WebNNCapability {
  partitions?: number;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: string[];
}

export interface LitertRow {
  model_id: string;
  file_path: string;
  backend: string;
  data_type: string;
  litert_version: string;
  webnn_ep: string;
  status: string;
  error_message: string | null;
  compilation_ms: number | null;
  load_and_compile_ms: number | null;
  first_inference_ms: number | null;
  average_ms: number | null;
  median_ms: number | null;
  best_ms: number | null;
  p90_ms: number | null;
  throughput_fps: number | null;
  webnn_capability: WebNNCapability | null;
  started_at: string;
}

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data, error } = await (supabase
    .from('results') as any)
    .select('model_id, file_path, backend, data_type, litert_version, webnn_ep, status, error_message, compilation_ms, load_and_compile_ms, first_inference_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, webnn_capability, started_at')
    .in('status', ['completed', 'error'])
    .neq('litert_version', '')
    .order('started_at', { ascending: false })
    .limit(500);

  const results: LitertRow[] = (data as LitertRow[]) ?? [];

  return {
    results,
    error: error?.message ?? null,
  };
};
