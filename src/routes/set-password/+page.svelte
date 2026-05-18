<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '$lib/supabase/client';

  let password = $state('');
  let confirm = $state('');
  let error = $state('');
  let loading = $state(false);
  let checking = $state(true);

  const supabase = createClient();

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/login';
      return;
    }
    checking = false;
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';

    if (password.length < 8) {
      error = 'Password must be at least 8 characters';
      return;
    }
    if (password !== confirm) {
      error = 'Passwords do not match';
      return;
    }

    loading = true;

    const { data: { user: updatedUser }, error: updateError } = await supabase.auth.updateUser({
      password,
      data: { needs_password: false },
    });

    if (updateError) {
      const msg = updateError.message || '';
      if (msg.toLowerCase().includes('different from the old')) {
        error = 'New password must be different from your current one.';
      } else if (msg.toLowerCase().includes('weak') || msg.toLowerCase().includes('password')) {
        error = msg;
      } else {
        error = 'Could not set password. Please try again.';
      }
      loading = false;
      return;
    }

    if (updatedUser?.email) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: updatedUser.email,
        password,
      });
      if (signInError) {
        error = 'Password saved, but sign-in failed. Please log in manually.';
        loading = false;
        return;
      }
    }

    window.location.href = '/';
  }
</script>

<div class="set-password-page">
  <div class="set-password-card">
    <h1 class="page-title">Set your password</h1>
    <p class="page-subtitle">Create a password for future sign-ins.</p>

    {#if checking}
      <p class="muted">Verifying session...</p>
    {:else}
      <form onsubmit={handleSubmit}>
        <label class="field-label" for="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          class="field-input"
          placeholder="At least 8 characters"
          bind:value={password}
          required
          minlength={8}
        />

        <label class="field-label" for="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          type="password"
          class="field-input"
          bind:value={confirm}
          required
          minlength={8}
        />

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading}>
          {loading ? 'Setting password...' : 'Set password and continue'}
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .set-password-page {
    display: grid;
    place-items: center;
    min-height: calc(100vh - 160px);
    padding: var(--space-3);
  }

  .set-password-card {
    width: 100%;
    max-width: 380px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .page-title {
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-text-primary);
    margin-bottom: var(--space-half);
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-bottom: var(--space-3);
  }

  .muted {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .field-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-half);
  }

  .field-input {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
    margin-bottom: var(--space-2);
    transition: border-color var(--transition-base);
  }

  .field-input:focus {
    border-color: var(--color-focus-ring);
  }

  .btn-primary {
    width: 100%;
    min-height: 40px;
  }

  .error-text {
    font-size: var(--text-xs);
    color: var(--color-error);
    margin-bottom: var(--space-1);
  }
</style>
