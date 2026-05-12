import { describe, it, expect } from 'vitest';
import { isAtLeast, ROLE_HIERARCHY, type Role } from '$lib/types/roles';

describe('Role hierarchy', () => {
  it('recognizes admin as highest', () => {
    expect(isAtLeast('admin', 'admin')).toBe(true);
    expect(isAtLeast('admin', 'anonymous')).toBe(true);
  });

  it('recognizes member is above anonymous', () => {
    expect(isAtLeast('member', 'anonymous')).toBe(true);
    expect(isAtLeast('member', 'member')).toBe(true);
  });

  it('anonymous cannot access member features', () => {
    expect(isAtLeast('anonymous', 'member')).toBe(false);
  });

  it('partner is above member', () => {
    expect(isAtLeast('partner', 'member')).toBe(true);
    expect(isAtLeast('member', 'partner')).toBe(false);
  });

  it('intel is above partner', () => {
    expect(isAtLeast('intel', 'partner')).toBe(true);
    expect(isAtLeast('partner', 'intel')).toBe(false);
  });

  it('hierarchy has 5 tiers', () => {
    expect(ROLE_HIERARCHY.length).toBe(5);
  });
});
