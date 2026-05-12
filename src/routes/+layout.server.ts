import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types/roles';

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = await locals.getSession();

  let role: Role = 'anonymous';
  if (session?.user) {
    role = (session.user.app_metadata?.role as Role) ?? 'member';
  }

  return {
    session,
    role
  };
};
