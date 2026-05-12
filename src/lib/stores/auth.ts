import { writable, derived } from 'svelte/store';
import type { Session, User } from '@supabase/supabase-js';
import type { Role } from '$lib/types/roles';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: Role;
  loading: boolean;
}

export const auth = writable<AuthState>({
  session: null,
  user: null,
  role: 'anonymous',
  loading: true
});

export const isAuthenticated = derived(auth, ($auth) => $auth.session !== null);
export const userRole = derived(auth, ($auth) => $auth.role);
