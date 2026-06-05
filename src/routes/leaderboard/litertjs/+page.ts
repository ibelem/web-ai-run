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
  browser: string | null;
  browser_version: string | null;
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

  // Fetch distinct filter values (no limit)
  const { data: versionRows } = await (supabase.from('results') as any)
    .select('litert_version')
    .in('status', ['completed', 'error'])
    .neq('litert_version', '');

  const { data: backendRows } = await (supabase.from('results') as any)
    .select('backend')
    .in('status', ['completed', 'error'])
    .neq('litert_version', '');

  const { data: epRows } = await (supabase.from('results') as any)
    .select('webnn_ep')
    .in('status', ['completed', 'error'])
    .neq('litert_version', '')
    .neq('webnn_ep', '');

  const { data: dtRows } = await (supabase.from('results') as any)
    .select('data_type')
    .in('status', ['completed', 'error'])
    .neq('litert_version', '');

  const distinctVersions: string[] = [...new Set((versionRows ?? []).map((r: any) => r.litert_version))].sort().reverse() as string[];
  const distinctBackends: string[] = [...new Set((backendRows ?? []).map((r: any) => r.backend))].sort() as string[];
  const distinctEps: string[] = [...new Set((epRows ?? []).map((r: any) => r.webnn_ep).filter(Boolean))].sort() as string[];
  const distinctDataTypes: string[] = [...new Set((dtRows ?? []).map((r: any) => r.data_type))].sort() as string[];

  // Fetch result data
  const { data, error } = await (supabase
    .from('results') as any)
    .select('model_id, file_path, backend, data_type, litert_version, webnn_ep, browser, browser_version, status, error_message, compilation_ms, load_and_compile_ms, first_inference_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, webnn_capability, started_at')
    .in('status', ['completed', 'error'])
    .neq('litert_version', '')
    .order('started_at', { ascending: false })
    .limit(1000);

  const results: LitertRow[] = (data as LitertRow[]) ?? [];

  return {
    results,
    distinctVersions,
    distinctBackends,
    distinctEps,
    distinctDataTypes,
    error: error?.message ?? null,
  };
};
