<script lang="ts">
  import { isAuthenticated } from '$lib/stores/auth';
  import { canRunBenchmark } from '$lib/guards/benchmark-guard';
  import { createClient } from '$lib/supabase/client';

  let showSignInModal = $state(false);
  let guardResult = $derived(canRunBenchmark($isAuthenticated, 'custom'));

  function handleRun() {
    if (!guardResult.allowed) {
      showSignInModal = true;
      return;
    }
  }

  async function signIn(provider: 'github' | 'google') {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  }
</script>

<h1>Custom Benchmark</h1>
<p>Upload and test your own model. Requires sign-in.</p>

<button class="btn-primary" onclick={handleRun}>
  Run Benchmark
</button>

{#if showSignInModal}
  <div class="dialog-backdrop" role="presentation" onclick={() => showSignInModal = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="dialog-panel"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="signin-title"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="signin-title">Sign in to continue</h2>
      <p class="dialog-body">{guardResult.reason}</p>
      <div class="dialog-actions">
        <button class="btn-secondary" onclick={() => signIn('github')}>Sign in with GitHub</button>
        <button class="btn-secondary" onclick={() => signIn('google')}>Sign in with Google</button>
        <button class="btn-ghost" onclick={() => showSignInModal = false}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  h1 {
    font-size: var(--text-xl);
    font-weight: 300;
    margin-bottom: var(--space-1);
  }

  p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  .btn-primary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 400;
    padding: var(--space-1) var(--space-2);
    min-height: 44px;
    background: var(--color-text-primary);
    color: var(--color-surface);
    border: none;
    border-radius: var(--radius-base);
    cursor: pointer;
    transition: opacity var(--transition-base);
  }

  .btn-primary:hover {
    opacity: 0.85;
  }

  .btn-primary:focus {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 2px;
  }

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: var(--z-overlay);
    display: grid;
    place-items: center;
  }

  .dialog-panel {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    max-width: 400px;
    width: calc(100% - var(--space-4));
    box-shadow: var(--shadow-overlay);
  }

  .dialog-panel h2 {
    font-size: var(--text-lg);
    font-weight: 300;
    margin-bottom: var(--space-1);
  }

  .dialog-body {
    margin-bottom: var(--space-2);
  }

  .dialog-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .btn-secondary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 400;
    padding: var(--space-1) var(--space-2);
    min-height: 44px;
    background: none;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-secondary:hover {
    background: var(--color-nav-item-hover);
  }

  .btn-secondary:focus {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 2px;
  }

  .btn-ghost {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 400;
    padding: var(--space-1) var(--space-2);
    min-height: 44px;
    background: none;
    color: var(--color-text-secondary);
    border: none;
    border-radius: var(--radius-base);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-ghost:hover {
    background: var(--color-nav-item-hover);
  }

  .btn-ghost:focus {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 2px;
  }
</style>
