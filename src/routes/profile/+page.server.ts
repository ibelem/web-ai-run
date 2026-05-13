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
  if (!session) {
    redirect(303, '/');
  }

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('id, email, role, display_name, avatar_url, organization, job_title, created_at')
    .eq('id', session.user.id)
    .single();

  return { profile: profile as ProfileData | null };
};

export const actions: Actions = {
  update: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) {
      redirect(303, '/');
    }

    const formData = await request.formData();
    const display_name = formData.get('display_name') as string | null;
    const organization = formData.get('organization') as string | null;
    const job_title = formData.get('job_title') as string | null;

    const { error } = await (locals.supabase
      .from('profiles') as any)
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
  }
};
