import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types/roles';

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = await locals.getSession();

  let role: Role = 'anonymous';
  if (session?.user) {
    role = (session.user.app_metadata?.role as Role) ?? 'member';
  }

  // For email/magic-link users (no OAuth provider photo), fetch their uploaded avatar
  let profileAvatarUrl: string | null = null;
  const hasOAuthPhoto = !!(
    session?.user?.user_metadata?.avatar_url ||
    session?.user?.user_metadata?.picture
  );
  if (session?.user && !hasOAuthPhoto) {
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
