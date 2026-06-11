<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
  import { loadTurnstileScript } from '$lib/utils/turnstile';

  // Shared Turnstile widget. Mounts the Cloudflare challenge, exposes the
  // token via $bindable so the parent can pass it to Supabase auth calls,
  // and provides a reset() the parent can call after using a token (tokens
  // are single-use). Renders once per parent.
  let { token = $bindable('') }: { token?: string } = $props();

  let host: HTMLDivElement | undefined = $state();
  let widgetId: string | null = null;

  function render() {
    if (!browser || !host || !window.turnstile) return;
    widgetId = window.turnstile.render(host, {
      sitekey: PUBLIC_TURNSTILE_SITE_KEY,
      size: 'flexible',
      callback: (t) => { token = t; },
      'error-callback': () => { token = ''; },
      'expired-callback': () => { token = ''; },
      'timeout-callback': () => { token = ''; }
    });
  }

  // Exposed for parents that want to manually reset (e.g. after submitting).
  export function reset() {
    token = '';
    if (browser && window.turnstile && widgetId !== null) {
      window.turnstile.reset(widgetId);
    }
  }

  onMount(() => {
    loadTurnstileScript(render);
  });

  onDestroy(() => {
    // Letting the script linger across navigations is fine — Cloudflare's
    // api.js handles unmounted nodes gracefully and avoiding the reload
    // saves a network round-trip on the next auth page.
  });
</script>

<div class="turnstile-host" bind:this={host}></div>

<style>
  .turnstile-host {
    width: 100%;
    margin-top: var(--space-2);
    min-height: 65px;
  }
</style>
