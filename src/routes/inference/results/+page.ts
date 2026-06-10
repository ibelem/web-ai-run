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
  gpu_driver_version: string | null;
  npu_driver_version: string | null;
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
  browser_version: string;
}

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return {
      results: [],
      distinctBackends: [], distinctDataTypes: [], distinctStatuses: [],
      distinctWebnnEps: [], distinctFrameworks: [],
      distinctOs: [], distinctBrowsers: [], distinctBrowserVers: [],
      distinctCpus: [], distinctGpus: [], distinctGpuDrivers: [], distinctNpuDrivers: [],
      profile: null, error: null,
    };
  }

  const userId = session.user.id;
  const t = (col: string) => (supabase.from('results') as any).select(col).eq('user_id', userId);

  const [
    backendRows, dtRows, statusRows, epRows, fwRows,
    osRows, browserRows, browserVerRows, cpuRows, gpuRows, gpuDrvRows, npuDrvRows,
    profileRes, resultsRes,
  ] = await Promise.all([
    t('backend'),
    t('data_type'),
    t('status'),
    t('webnn_ep').neq('webnn_ep', ''),
    t('ort_version, litert_version'),
    t('os'),
    t('browser'),
    t('browser_version'),
    t('cpu'),
    t('gpu'),
    t('gpu_driver_version').not('gpu_driver_version', 'is', null),
    t('npu_driver_version').not('npu_driver_version', 'is', null),
    (supabase.from('profiles') as any).select('display_name, avatar_url').eq('id', userId).single(),
    (supabase.from('results') as any)
      .select('id, model_id, file_path, backend, data_type, status, error_message, ort_version, litert_version, webnn_ep, compilation_ms, load_and_compile_ms, first_inference_ms, time_to_first_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, iterations, iterations_completed, started_at, completed_at, cpu, gpu, os, browser, browser_version, gpu_driver_version, npu_driver_version')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(10000),
  ]);

  function distinct(rows: any[] | null, key: string): string[] {
    return [...new Set((rows ?? []).map((r: any) => r[key]).filter(Boolean))].sort() as string[];
  }

  const distinctBackends    = distinct(backendRows.data,    'backend');
  const distinctDataTypes   = distinct(dtRows.data,         'data_type');
  const distinctStatuses    = distinct(statusRows.data,     'status');
  const distinctWebnnEps    = distinct(epRows.data,         'webnn_ep');
  const distinctFrameworks: string[] = [...new Set((fwRows.data ?? []).map((r: any) => {
    if (r.ort_version)   return `ORT Web ${r.ort_version}`;
    if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
    return '';
  }).filter(Boolean))].sort() as string[];
  const distinctOs          = distinct(osRows.data,         'os');
  const distinctBrowsers    = distinct(browserRows.data,    'browser');
  const distinctBrowserVers = distinct(browserVerRows.data, 'browser_version');
  const distinctCpus        = distinct(cpuRows.data,        'cpu');
  const distinctGpus        = distinct(gpuRows.data,        'gpu');
  const distinctGpuDrivers  = distinct(gpuDrvRows.data,     'gpu_driver_version');
  const distinctNpuDrivers  = distinct(npuDrvRows.data,     'npu_driver_version');

  const results: ResultRow[] = (resultsRes.data as ResultRow[]) ?? [];
  const profile = profileRes.data as { display_name: string | null; avatar_url: string | null } | null;

  return {
    results,
    distinctBackends, distinctDataTypes, distinctStatuses, distinctWebnnEps, distinctFrameworks,
    distinctOs, distinctBrowsers, distinctBrowserVers,
    distinctCpus, distinctGpus, distinctGpuDrivers, distinctNpuDrivers,
    profile,
    error: resultsRes.error?.message ?? null,
  };
};
