<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { initTheme, toggleTheme, theme } from '$lib/stores/theme';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { createClient } from '$lib/supabase/client';
  import type { Role } from '$lib/types/roles';

  let { data, children } = $props();

  const supabase = createClient();

  onMount(() => {
    initTheme();

    const role: Role = data.session?.user?.app_metadata?.role ?? 'anonymous';
    auth.set({
      session: data.session,
      user: data.session?.user ?? null,
      role: data.session ? role : 'anonymous',
      loading: false
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newRole: Role = session?.user?.app_metadata?.role ?? 'anonymous';
      auth.set({
        session,
        user: session?.user ?? null,
        role: session ? newRole : 'anonymous',
        loading: false
      });
    });

    return () => subscription.unsubscribe();
  });

  async function signIn(provider: 'github' | 'google') {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const navItems = [
    { href: '/model', label: 'Model' },
    { href: '/recipe', label: 'Recipe' },
    { href: '/custom', label: 'Custom' }
  ];
</script>

<nav class="top-bar">
  <div class="nav-left">
    <a href="/" class="logo">webai.run</a>
    {#each navItems as item}
      <a
        href={item.href}
        class="nav-item"
        class:active={$page.url.pathname.startsWith(item.href)}
      >
        {item.label}
      </a>
    {/each}
  </div>
  <div class="nav-right">
    <button class="nav-item" onclick={toggleTheme} aria-label="Toggle theme">
      {$theme === 'light' ? '🌙' : '☀️'}
    </button>
    {#if $isAuthenticated}
      <button class="nav-item" onclick={signOut}>Sign out</button>
    {:else}
      <button class="nav-item" onclick={() => signIn('github')}>Sign in</button>
    {/if}
  </div>
</nav>

<main>
  {@render children()}
</main>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 var(--space-2);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
  }

  .nav-left, .nav-right {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .logo {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    font-weight: 400;
    text-decoration: none;
    color: var(--color-text-primary);
    margin-right: var(--space-2);
  }

  .nav-item {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 400;
    text-decoration: none;
    color: var(--color-text-secondary);
    padding: var(--space-half) var(--space-1);
    border-radius: var(--radius-base);
    border: none;
    background: none;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .nav-item:hover {
    background: var(--color-nav-item-hover);
  }

  .nav-item.active {
    color: var(--color-text-primary);
    background: var(--color-nav-item-active);
  }

  main {
    padding: var(--space-3);
    max-width: 1280px;
    margin: 0 auto;
  }
</style>
