import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export interface ProfileData {
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
  if (!session) throw redirect(302, '/login');

  const userId = session.user.id;

  const [recipesRes, sharedRes, resultsRes, profileRes] = await Promise.all([
    (locals.supabase.from('recipes') as any)
      .select('id, name, slug, visibility, models, updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false }),
    (locals.supabase.from('shared_configs') as any)
      .select('id, config, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false }),
    (locals.supabase.from('results') as any)
      .select('id, run_id, model_id, file_path, backend, data_type, status, average_ms, median_ms, p90_ms, throughput_fps, iterations, started_at, completed_at, cpu, gpu, os, browser')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    locals.supabase
      .from('profiles')
      .select('id, email, role, display_name, avatar_url, organization, job_title, created_at')
      .eq('id', userId)
      .single(),
  ]);

  return {
    session,
    recipes: recipesRes.data ?? [],
    sharedConfigs: sharedRes.data ?? [],
    results: resultsRes.data ?? [],
    profile: (profileRes.data as unknown as ProfileData) ?? null,
  };
};

export const actions: Actions = {
  update: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw redirect(302, '/login');

    const formData = await request.formData();
    const display_name = formData.get('display_name') as string | null;
    const organization = formData.get('organization') as string | null;
    const job_title = formData.get('job_title') as string | null;

    const { error } = await (locals.supabase.from('profiles') as any)
      .update({
        display_name: display_name?.trim() || null,
        organization: organization?.trim() || null,
        job_title: job_title?.trim() || null,
      })
      .eq('id', session.user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  updateAvatar: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw redirect(302, '/login');

    const formData = await request.formData();
    const raw = (formData.get('avatar_url') as string | null) || null;

    // Validate: must be null or a valid https URL
    let avatar_url: string | null = null;
    if (raw) {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'https:') throw new Error('invalid protocol');
        avatar_url = raw;
      } catch {
        return { success: false, error: 'Invalid avatar URL.' };
      }
    }

    const { error } = await (locals.supabase.from('profiles') as any)
      .update({ avatar_url })
      .eq('id', session.user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  },
};
