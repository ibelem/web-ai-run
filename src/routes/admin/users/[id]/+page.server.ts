import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export type AccountEventType = 'sign_in' | 'role_changed' | 'result_uploaded' | 'result_deleted' | 'recipe_deleted';

export interface AccountEventRow {
  id: number;
  event_type: AccountEventType;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const session = await locals.getSession();
  if (!session) {
    throw redirect(303, '/');
  }

  const role = session.user.app_metadata?.role;
  if (role !== 'admin') {
    throw error(403, 'Admin access required');
  }

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('id, email, display_name, avatar_url')
    .eq('id', params.id)
    .single();

  if (!profile) {
    throw error(404, 'User not found');
  }

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: events, count } = await locals.supabase
    .from('account_events')
    .select('id, event_type, metadata, created_at', { count: 'exact' })
    .eq('user_id', params.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  return {
    profile: profile as { id: string; email: string; display_name: string | null; avatar_url: string | null },
    events: (events as AccountEventRow[]) ?? [],
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  };
};
