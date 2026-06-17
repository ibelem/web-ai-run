import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import type { ResultsLlmRow } from '$lib/engine/types';

export type { ResultsLlmRow };

// Leaderboard-scope (cross-user) trend data for LLM benchmarks. Completed rows
// only — a trend over errored runs is noise.
export const load: PageLoad = async () => {
  const supabase = createClient();

  const baseFilter = (q: any) => q.eq('status', 'completed');
  const t = (col: string) => baseFilter((supabase.from('results_llm') as any).select(col));

  const [
    backendRows, dtRows, fwRows, epRows,
    osRows, browserRows, browserVerRows,
    cpuRows, gpuRows, gpuDrvRows, npuDrvRows,
    resultsRes,
  ] = await Promise.all([
    t('backend'),
    t('data_type'),
    t('runtime, runtime_version'),
    t('webnn_ep').neq('webnn_ep', '').not('webnn_ep', 'is', null),
    t('os'),
    t('browser'),
    t('browser_version'),
    t('cpu'),
    t('gpu'),
    t('gpu_driver_version').not('gpu_driver_version', 'is', null),
    t('npu_driver_version').not('npu_driver_version', 'is', null),
    baseFilter((supabase.from('results_llm') as any).select('*'))
      .order('started_at', { ascending: true })
      .limit(5000),
  ]);

  function distinct(rows: any[] | null, key: string): string[] {
    return [...new Set((rows ?? []).map((r: any) => r[key]).filter(Boolean))].sort() as string[];
  }

  const fwSet = new Set<string>();
  for (const r of (fwRows.data ?? []) as any[]) {
    if (!r.runtime) continue;
    fwSet.add(r.runtime_version ? `${r.runtime} ${r.runtime_version}` : r.runtime);
  }

  return {
    results: (resultsRes.data ?? []) as ResultsLlmRow[],
    distinctBackends:    distinct(backendRows.data,    'backend'),
    distinctDataTypes:   distinct(dtRows.data,         'data_type'),
    distinctFrameworks:  [...fwSet].sort(),
    distinctEps:         distinct(epRows.data,         'webnn_ep'),
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
