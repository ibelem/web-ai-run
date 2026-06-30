import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) {
    throw redirect(303, '/');
  }

  const role = session.user.app_metadata?.role;
  if (role !== 'admin') {
    throw error(403, 'Admin access required');
  }

  return {};
};
