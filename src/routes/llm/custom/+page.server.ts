import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loginUrl } from '$lib/utils/login-redirect';

export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.getSession();
  if (!session) {
    throw redirect(302, loginUrl(url.pathname + url.search));
  }
};
