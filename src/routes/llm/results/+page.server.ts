import type { PageServerLoad } from './$types';
import type { ResultsLlmRow } from '$lib/engine/types';

export type { ResultsLlmRow };

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) return { results: [], profile: null, error: null };

  const supabase = locals.supabase;
  const userId = session.user.id;
  const t = (col: string) => (supabase.from('results_llm') as any).select(col).eq('user_id', userId);

  const [
    backendRows, dtRows, frameworkRows, statusRows, webnnEpRows,
    osRows, browserRows, browserVerRows, cpuRows, gpuRows,
    gpuDriverRows, npuDriverRows,
    profileRes, resultsRes,
  ] = await Promise.all([
    t('backend'),
    t('data_type'),
    t('runtime, runtime_version'),
    t('status'),
    t('webnn_ep'),
    t('os'),
    t('browser'),
    t('browser_version'),
    t('cpu'),
    t('gpu'),
    t('gpu_driver_version'),
    t('npu_driver_version'),
    (supabase.from('profiles') as any).select('display_name, avatar_url').eq('id', userId).single(),
    (supabase.from('results_llm') as any)
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(5000),
  ]);

  function distinct(rows: any[] | null, key: string): string[] {
    return [...new Set((rows ?? []).map((r: any) => r[key]).filter(Boolean))].sort() as string[];
  }

  // Combine runtime + runtime_version into a single "JS Framework" label,
  // e.g. "Transformers.js 4.2.0". Each unique combo becomes one option.
  const frameworkSet = new Set<string>();
  for (const r of (frameworkRows.data ?? []) as any[]) {
    if (!r.runtime) continue;
    const label = r.runtime_version ? `${r.runtime} ${r.runtime_version}` : r.runtime;
    frameworkSet.add(label);
  }
  const distinctFrameworks: string[] = [...frameworkSet].sort();

  return {
    results: (resultsRes.data ?? []) as ResultsLlmRow[],
    distinctBackends:    distinct(backendRows.data,    'backend'),
    distinctDataTypes:   distinct(dtRows.data,          'data_type'),
    distinctFrameworks,
    distinctStatuses:    distinct(statusRows.data,      'status'),
    distinctWebnnEps:    distinct(webnnEpRows.data,     'webnn_ep'),
    distinctOs:          distinct(osRows.data,          'os'),
    distinctBrowsers:    distinct(browserRows.data,     'browser'),
    distinctBrowserVers: distinct(browserVerRows.data,  'browser_version'),
    distinctCpus:        distinct(cpuRows.data,         'cpu'),
    distinctGpus:        distinct(gpuRows.data,         'gpu'),
    distinctGpuDrivers:  distinct(gpuDriverRows.data,   'gpu_driver_version'),
    distinctNpuDrivers:  distinct(npuDriverRows.data,   'npu_driver_version'),
    profile: profileRes.data ?? null,
    error: resultsRes.error?.message ?? null,
  };
};
