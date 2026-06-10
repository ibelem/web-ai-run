import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ResultRow } from '../../../inference/results/+page.server';
import { loginUrl } from '$lib/utils/login-redirect';

export interface AdminResultRow extends ResultRow {
  user_id: string;
  user_display_name: string | null;
  user_avatar_url: string | null;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string;
}

function distinct(rows: any[] | null, key: string): string[] {
  return [...new Set((rows ?? []).map((r: any) => r[key]).filter(Boolean))].sort() as string[];
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(303, loginUrl(url.pathname + url.search));

  const role = session.user.app_metadata?.role;
  if (role !== 'admin') throw error(403, 'Admin access required');

  const supabase = locals.supabase;
  const t = (col: string) => (supabase.from('results') as any).select(col);

  const [
    backendRows, dtRows, statusRows, epRows, fwRows,
    osRows, browserRows, browserVerRows, cpuRows, gpuRows, gpuDrvRows, npuDrvRows,
    usersRes, resultsRes,
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
    (supabase.from('profiles') as any)
      .select('id, display_name, avatar_url, email')
      .order('display_name', { ascending: true }),
    (supabase.from('results') as any)
      .select('id, user_id, model_id, file_path, backend, data_type, status, error_message, ort_version, litert_version, webnn_ep, compilation_ms, load_and_compile_ms, first_inference_ms, time_to_first_ms, average_ms, median_ms, best_ms, p90_ms, throughput_fps, iterations, iterations_completed, started_at, completed_at, cpu, gpu, os, browser, browser_version, gpu_driver_version, npu_driver_version')
      .order('started_at', { ascending: false })
      .limit(10000),
  ]);

  // Build user lookup map
  const users: UserProfile[] = (usersRes.data as UserProfile[]) ?? [];
  const userMap = new Map(users.map(u => [u.id, u]));

  // Join profile data onto each result row
  const rawResults: AdminResultRow[] = ((resultsRes.data ?? []) as any[]).map((r: any) => {
    const u = userMap.get(r.user_id);
    return {
      ...r,
      user_display_name: u?.display_name ?? u?.email ?? r.user_id,
      user_avatar_url: u?.avatar_url ?? null,
    };
  });

  return {
    results: rawResults,
    users,
    distinctBackends:    distinct(backendRows.data,    'backend'),
    distinctDataTypes:   distinct(dtRows.data,         'data_type'),
    distinctStatuses:    distinct(statusRows.data,     'status'),
    distinctWebnnEps:    distinct(epRows.data,         'webnn_ep'),
    distinctFrameworks:  [...new Set((fwRows.data ?? []).map((r: any) => {
      if (r.ort_version)    return `ORT Web ${r.ort_version}`;
      if (r.litert_version) return `LiteRT.js ${r.litert_version}`;
      return '';
    }).filter(Boolean))].sort() as string[],
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
