export const ROLE_HIERARCHY = ['anonymous', 'member', 'partner', 'intel', 'admin'] as const;

export type Role = (typeof ROLE_HIERARCHY)[number];

export function isAtLeast(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}
