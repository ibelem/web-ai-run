import { writable, get } from 'svelte/store';

export type Theme = 'light' | 'dark';

export const theme = writable<Theme>('light');

export function initTheme(): void {
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') {
    setTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(prefersDark ? 'dark' : 'light');
}

export function toggleTheme(): void {
  const current = get(theme);
  const next: Theme = current === 'light' ? 'dark' : 'light';
  setTheme(next);
}

function setTheme(value: Theme): void {
  theme.set(value);
  document.documentElement.setAttribute('data-theme', value);
  localStorage.setItem('theme', value);
}
