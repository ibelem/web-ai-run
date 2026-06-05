import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ResultsLlmRow } from '$lib/engine/types';

export interface AdminResultsLlmRow extends ResultsLlmRow {
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

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(303, '/login');

  const role = session.user.app_metadata?.role;
  if (role !== 'admin') throw error(403, 'Admin access required');

  const supabase = locals.supabase;
  const t = (col: string) => (supabase.from('results_llm') as any).select(col);

  const [
    backendRows, dtRows, runtimeRows, statusRows,
    osRows, browserRows, browserVerRows, cpuRows, gpuRows,
    usersRes, resultsRes,
  ] = await Promise.all([
    t('backend'),
    t('data_type'),
    t('runtime'),
    t('status'),
    t('os'),
    t('browser'),
    t('browser_version'),
    t('cpu'),
    t('gpu'),
    (supabase.from('profiles') as any)
      .select('id, display_name, avatar_url, email')
      .order('display_name', { ascending: true }),
    (supabase.from('results_llm') as any)
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10000),
  ]);

  const users: UserProfile[] = (usersRes.data as UserProfile[]) ?? [];
  const userMap = new Map(users.map((u: UserProfile) => [u.id, u]));

  const rawResults: AdminResultsLlmRow[] = ((resultsRes.data ?? []) as any[]).map((r: any) => {
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
    distinctBackends:  distinct(backendRows.data,  'backend'),
    distinctDataTypes: distinct(dtRows.data,        'data_type'),
    distinctRuntimes:  distinct(runtimeRows.data,   'runtime'),
    distinctStatuses:  distinct(statusRows.data,    'status'),
    distinctOs:        distinct(osRows.data,        'os'),
    distinctBrowsers:  distinct(browserRows.data,   'browser'),
    distinctBrowserVers: distinct(browserVerRows.data, 'browser_version'),
    distinctCpus:      distinct(cpuRows.data,       'cpu'),
    distinctGpus:      distinct(gpuRows.data,       'gpu'),
    error: resultsRes.error?.message ?? null,
  };
};
