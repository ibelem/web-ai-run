import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';
import type { ResultsLlmRow } from '$lib/engine/types';

export type { ResultsLlmRow };

export const load: PageLoad = async () => {
  const supabase = createClient();

  const baseFilter = (q: any) => q.in('status', ['completed', 'error']);
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
      .order('started_at', { ascending: false })
      .limit(5000),
  ]);

  function distinct(rows: any[] | null, key: string): string[] {
    return [...new Set((rows ?? []).map((r: any) => r[key]).filter(Boolean))].sort() as string[];
  }

  const distinctBackends    = distinct(backendRows.data,    'backend');
  const distinctDataTypes   = distinct(dtRows.data,         'data_type');
  const distinctEps         = distinct(epRows.data,         'webnn_ep');
  const distinctOs          = distinct(osRows.data,         'os');
  const distinctBrowsers    = distinct(browserRows.data,    'browser');
  const distinctBrowserVers = distinct(browserVerRows.data, 'browser_version');
  const distinctCpus        = distinct(cpuRows.data,        'cpu');
  const distinctGpus        = distinct(gpuRows.data,        'gpu');
  const distinctGpuDrivers  = distinct(gpuDrvRows.data,     'gpu_driver_version');
  const distinctNpuDrivers  = distinct(npuDrvRows.data,     'npu_driver_version');

  const fwSet = new Set<string>();
  for (const r of (fwRows.data ?? []) as any[]) {
    if (!r.runtime) continue;
    const label = r.runtime_version ? `${r.runtime} ${r.runtime_version}` : r.runtime;
    fwSet.add(label);
  }
  const distinctFrameworks: string[] = [...fwSet].sort();

  return {
    results: (resultsRes.data ?? []) as ResultsLlmRow[],
    distinctBackends,
    distinctDataTypes,
    distinctFrameworks,
    distinctEps,
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
