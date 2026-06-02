import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface WebNNEpRow {
  model_id: string;
  file_path: string;
  backend: string;
  data_type: string;
  ort_version: string;
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
  started_at: string;
}

export const load: PageLoad = async () => {
  const supabase = createClient();

  const baseFilter = (q: any) => q
    .in('status', ['completed', 'error'])
    .neq('webnn_ep', '')
    .neq('webnn_ep', 'Default / Unknown');

  // Fetch distinct filter values (no limit)
  const { data: epRows } = await baseFilter((supabase.from('results') as any).select('webnn_ep'));
  const { data: backendRows } = await baseFilter((supabase.from('results') as any).select('backend'));
  const { data: dtRows } = await baseFilter((supabase.from('results') as any).select('data_type'));
  const { data: fwRows } = await baseFilter((supabase.from('results') as any).select('ort_version, litert_version'));

  const distinctEps: string[] = [...new Set((epRows ?? []).map((r: any) => r.webnn_ep))].sort() as string[];
  const distinctBackends: string[] = [...new Set((backendRows ?? []).map((r: any) => r.backend))].sort() as string[];
  const distinctDataTypes: string[] = [...new Set((dtRows ?? []).map((r: any) => r.data_type))].sort() as string[];
  const distinctFrameworks: string[] = [...new Set((fwRows ?? []).map((r: any) => {
    if (r.ort_version) return `ORT Web ${r.ort_version}`;
    if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
    return '';
  }).filter(Boolean))].sort() as string[];

  // Fetch result data
  const { data, error } = await baseFilter((supabase.from('results') as any)
    .select('model_id, file_path, backend, data_type, ort_version, litert_version, webnn_ep, status, error_message, compilation_ms, load_and_compile_ms, first_inference_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, started_at'))
    .order('started_at', { ascending: false })
    .limit(1000);

  const results: WebNNEpRow[] = (data as WebNNEpRow[]) ?? [];

  return {
    results,
    distinctEps,
    distinctBackends,
    distinctDataTypes,
    distinctFrameworks,
    error: error?.message ?? null,
  };
};
