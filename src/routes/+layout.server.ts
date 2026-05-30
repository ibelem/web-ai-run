import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types/roles';

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = await locals.getSession();

  let role: Role = 'anonymous';
  if (session?.user) {
    role = (session.user.app_metadata?.role as Role) ?? 'member';
  }

  // Always fetch uploaded avatar — it takes priority over OAuth provider photo
  let profileAvatarUrl: string | null = null;
  if (session?.user) {
    const { data } = await locals.supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', session.user.id)
      .single();
    profileAvatarUrl = (data as unknown as { avatar_url: string | null })?.avatar_url ?? null;
  }

  return {
    session,
    role,
    profileAvatarUrl,
  };
};
