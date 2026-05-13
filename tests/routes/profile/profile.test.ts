import { describe, it, expect } from 'vitest';
import { ROLE_HIERARCHY, isAtLeast } from '$lib/types/roles';

describe('Profile & Role Management', () => {
  it('ROLE_HIERARCHY has 5 tiers in correct order', () => {
    expect(ROLE_HIERARCHY).toEqual(['anonymous', 'member', 'partner', 'intel', 'admin']);
  });

  it('isAtLeast correctly compares roles', () => {
    expect(isAtLeast('admin', 'member')).toBe(true);
    expect(isAtLeast('member', 'admin')).toBe(false);
    expect(isAtLeast('partner', 'partner')).toBe(true);
    expect(isAtLeast('anonymous', 'member')).toBe(false);
  });

  it('profile server module is importable', async () => {
    const mod = await import('../../../src/routes/profile/+page.server');
    expect(typeof mod.load).toBe('function');
    expect(typeof mod.actions.update).toBe('function');
  });

  it('admin server module is importable', async () => {
    const mod = await import('../../../src/routes/admin/users/+page.server');
    expect(typeof mod.load).toBe('function');
    expect(typeof mod.actions.setRole).toBe('function');
  });
});
