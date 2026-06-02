import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface ResultRow {
  id: string;
  model_id: string;
  file_path: string;
  backend: string;
  data_type: string;
  status: string;
  error_message: string | null;
  ort_version: string;
  litert_version: string;
  webnn_ep: string;
  compilation_ms: number | null;
  load_and_compile_ms: number | null;
  first_inference_ms: number | null;
  time_to_first_ms: number | null;
  average_ms: number | null;
  median_ms: number | null;
  best_ms: number | null;
  p90_ms: number | null;
  throughput_fps: number | null;
  iterations: number;
  iterations_completed: number;
  started_at: string;
  completed_at: string | null;
  cpu: string;
  gpu: string;
  os: string;
  browser: string;
}

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { results: [], distinctBackends: [], distinctDataTypes: [], distinctStatuses: [], distinctWebnnEps: [], distinctFrameworks: [], error: null };
  }

  const userId = session.user.id;

  // Fetch distinct filter values (no limit)
  const { data: backendRows } = await (supabase.from('results') as any).select('backend').eq('user_id', userId);
  const { data: dtRows } = await (supabase.from('results') as any).select('data_type').eq('user_id', userId);
  const { data: statusRows } = await (supabase.from('results') as any).select('status').eq('user_id', userId);
  const { data: epRows } = await (supabase.from('results') as any).select('webnn_ep').eq('user_id', userId).neq('webnn_ep', '');
  const { data: fwRows } = await (supabase.from('results') as any).select('ort_version, litert_version').eq('user_id', userId);

  const distinctBackends: string[] = [...new Set((backendRows ?? []).map((r: any) => r.backend))].sort() as string[];
  const distinctDataTypes: string[] = [...new Set((dtRows ?? []).map((r: any) => r.data_type))].sort() as string[];
  const distinctStatuses: string[] = [...new Set((statusRows ?? []).map((r: any) => r.status))].sort() as string[];
  const distinctWebnnEps: string[] = [...new Set((epRows ?? []).map((r: any) => r.webnn_ep).filter(Boolean))].sort() as string[];
  const distinctFrameworks: string[] = [...new Set((fwRows ?? []).map((r: any) => {
    if (r.ort_version) return `ORT Web ${r.ort_version}`;
    if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
    return '';
  }).filter(Boolean))].sort() as string[];

  // Fetch result data
  const { data, error } = await (supabase
    .from('results') as any)
    .select('id, model_id, file_path, backend, data_type, status, error_message, ort_version, litert_version, webnn_ep, compilation_ms, load_and_compile_ms, first_inference_ms, time_to_first_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, iterations, iterations_completed, started_at, completed_at, cpu, gpu, os, browser')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(500);

  const results: ResultRow[] = (data as ResultRow[]) ?? [];

  return {
    results,
    distinctBackends,
    distinctDataTypes,
    distinctStatuses,
    distinctWebnnEps,
    distinctFrameworks,
    error: error?.message ?? null,
  };
};
