import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createClient } from '$lib/supabase/client';
import type { LeaderboardRow } from '../leaderboard/+page.ts';

export type { LeaderboardRow };

// First-visit example: a bare /inference/trend (no params) averages every model
// together and looks messy. Redirect to a concrete, readable example so users
// land on a real single-model trend they can then tweak. Shareable + bookmarkable.
const EXAMPLE_QS =
  'series=none&x=browser_version&q=litert-community%2FMobileNet-v2&f=mobilenet_v2.tflite&backend=webnn_gpu&ep=litert&fw=LiteRT.js+2.5.2';

// Trend is a LEADERBOARD-scope view (cross-user, all data) — same data source as
// /inference/leaderboard, NOT the per-user results page. Only rows that produced
// metrics (status=completed) are plotted; a trend over errors is noise.
export const load: PageLoad = async ({ url }) => {
  if ([...url.searchParams.keys()].length === 0) {
    redirect(307, `/inference/trend?${EXAMPLE_QS}`);
  }

  const supabase = createClient();

  const baseFilter = (q: any) => q.eq('status', 'completed');
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
    )).order('started_at', { ascending: true }).limit(10000),
  ]);

  function distinct(rows: any[] | null, key: string): string[] {
    return [...new Set((rows ?? []).map((r: any) => r[key]).filter(Boolean))].sort() as string[];
  }

  const distinctFrameworks: string[] = [...new Set((fwRows.data ?? []).map((r: any) => {
    if (r.ort_version)    return `ORT Web ${r.ort_version}`;
    if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
    return '';
  }).filter(Boolean))].sort() as string[];

  return {
    results: (resultsRes.data as LeaderboardRow[]) ?? [],
    distinctBackends:    distinct(backendRows.data,    'backend'),
    distinctDataTypes:   distinct(dtRows.data,         'data_type'),
    distinctWebnnEps:    distinct(epRows.data,         'webnn_ep'),
    distinctFrameworks,
    distinctOs:          distinct(osRows.data,         'os'),
    distinctBrowsers:    distinct(browserRows.data,    'browser'),
    distinctBrowserVers: distinct(browserVerRows.data, 'browser_version'),
    distinctCpus:        distinct(cpuRows.data,        'cpu'),
    distinctGpus:        distinct(gpuRows.data,        'gpu'),
    distinctGpuDrivers:  distinct(gpuDrvRows.data,     'gpu_driver_version'),
    distinctNpuDrivers:  distinct(npuDrvRows.data,     'npu_driver_version'),
    error: resultsRes.error?.message ?? null,
  };
};
