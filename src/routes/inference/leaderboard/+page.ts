import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export interface WebNNCapability {
  partitions?: number;
  total_nodes: number;
  supported_nodes: number;
  unsupported_ops: string[];
}

export interface LeaderboardRow {
  model_id: string;
  file_path: string;
  backend: string;
  data_type: string;
  ort_version: string | null;
  litert_version: string | null;
  webnn_ep: string | null;
  webnn_capability: WebNNCapability | null;
  cpu: string | null;
  gpu: string | null;
  os: string | null;
  browser: string | null;
  browser_version: string | null;
  gpu_driver_version: string | null;
  npu_driver_version: string | null;
  status: string;
  error_message: string | null;
  compilation_ms: number | null;
  load_and_compile_ms: number | null;
  first_inference_ms: number | null;
  time_to_first_ms: number | null;
  average_ms: number | null;
  median_ms: number | null;
  best_ms: number | null;
  p90_ms: number | null;
  throughput_fps: number | null;
  iterations: number | null;
  started_at: string;
}

export const load: PageLoad = async () => {
  const supabase = createClient();

  const baseFilter = (q: any) => q.in('status', ['completed', 'error']);

  const t = (col: string) => baseFilter((supabase.from('results') as any).select(col));

  const [
    backendRows, dtRows, epRows, fwRows,
    osRows, browserRows, browserVerRows, cpuRows, gpuRows, gpuDrvRows, npuDrvRows,
    resultsRes,
  ] = await Promise.all([
    t('backend'),
    t('data_type'),
    t('webnn_ep').neq('webnn_ep', '').neq('webnn_ep', 'Default / Unknown'),
    t('ort_version, litert_version'),
    t('os'),
    t('browser'),
    t('browser_version'),
    t('cpu'),
    t('gpu'),
    t('gpu_driver_version').not('gpu_driver_version', 'is', null),
    t('npu_driver_version').not('npu_driver_version', 'is', null),
    baseFilter((supabase.from('results') as any).select(
      'model_id, file_path, backend, data_type, ort_version, litert_version, webnn_ep, webnn_capability, cpu, gpu, os, browser, browser_version, gpu_driver_version, npu_driver_version, status, error_message, compilation_ms, load_and_compile_ms, first_inference_ms, time_to_first_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, iterations, started_at'
    )).order('started_at', { ascending: false }).limit(5000),
  ]);

  function distinct(rows: any[] | null, key: string): string[] {
    return [...new Set((rows ?? []).map((r: any) => r[key]).filter(Boolean))].sort() as string[];
  }

  const distinctBackends    = distinct(backendRows.data,    'backend');
  const distinctDataTypes   = distinct(dtRows.data,         'data_type');
  const distinctEps         = distinct(epRows.data,         'webnn_ep');
  const distinctOrtVersions = distinct(fwRows.data,         'ort_version');
  const distinctLitertVersions = distinct(fwRows.data,      'litert_version').reverse();
  const distinctFrameworks: string[] = [...new Set((fwRows.data ?? []).map((r: any) => {
    if (r.ort_version)    return `ORT Web ${r.ort_version}`;
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

  const results: LeaderboardRow[] = (resultsRes.data as LeaderboardRow[]) ?? [];

  return {
    results,
    distinctBackends,
    distinctDataTypes,
    distinctEps,
    distinctOrtVersions,
    distinctLitertVersions,
    distinctFrameworks,
    distinctOs,
    distinctBrowsers,
    distinctBrowserVers,
    distinctCpus,
    distinctGpus,
    distinctGpuDrivers,
    distinctNpuDrivers,
    error: resultsRes.error?.message ?? null,
  };
};
