import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export interface UserRow {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
  organization: string | null;
  job_title: string | null;
  created_at: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) {
    redirect(303, '/');
  }

  const role = session.user.app_metadata?.role;
  if (role !== 'admin') {
    error(403, 'Admin access required');
  }

  const { data: users } = await locals.supabase
    .from('profiles')
    .select('id, email, role, display_name, avatar_url, organization, job_title, created_at')
    .order('created_at', { ascending: true });

  return { users: (users as UserRow[]) ?? [] };
};

export const actions: Actions = {
  setRole: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) {
      redirect(303, '/');
    }

    const adminRole = session.user.app_metadata?.role;
    if (adminRole !== 'admin') {
      error(403, 'Admin access required');
    }

    const formData = await request.formData();
    const userId = formData.get('user_id') as string;
    const newRole = formData.get('role') as string;

    if (!userId || !newRole) {
      return { success: false, error: 'Missing user_id or role' };
    }

    const { error: rpcError } = await locals.supabase.rpc('set_user_role' as any, {
      target_user_id: userId,
      new_role: newRole,
    } as any);

    if (rpcError) {
      return { success: false, error: rpcError.message };
    }

    return { success: true, userId, newRole };
  }
};
