import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { theme, toggleTheme, initTheme } from '$lib/stores/theme';

describe('theme store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn()
    });
    vi.stubGlobal('document', {
      documentElement: { setAttribute: vi.fn() }
    });
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: false }))
    });
  });

  it('defaults to light', () => {
    initTheme();
    expect(get(theme)).toBe('light');
  });

  it('toggles from light to dark', () => {
    initTheme();
    toggleTheme();
    expect(get(theme)).toBe('dark');
  });

  it('toggles from dark to light', () => {
    initTheme();
    toggleTheme();
    toggleTheme();
    expect(get(theme)).toBe('light');
  });

  it('persists to localStorage on toggle', () => {
    initTheme();
    toggleTheme();
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
  });
});
