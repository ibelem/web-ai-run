<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '$lib/supabase/client';
  import { meetsAllRules } from '$lib/utils/password-rules';
  import PasswordField from '$lib/components/auth/PasswordField.svelte';

  // Reset-password landing page. Reached via the email link from
  // /forgot-password. By the time we render, the auth/callback handler has
  // already exchanged the token for a session, so updateUser() works without
  // re-prompting for credentials.

  const supabase = createClient();

  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  let checking = $state(true);

  const passwordOk = $derived(meetsAllRules(password));

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // No session means the recovery token was invalid or expired.
      window.location.href = '/forgot-password?expired=1';
      return;
    }
    checking = false;
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!passwordOk) {
      error = 'Password must meet all requirements.';
      return;
    }
    error = '';
    loading = true;

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      const msg = updateError.message?.toLowerCase() ?? '';
      if (msg.includes('different from the old')) {
        error = 'New password must be different from your previous one.';
      } else {
        error = updateError.message || 'Could not update password. Please try again.';
      }
      loading = false;
      return;
    }
    window.location.href = '/';
  }
</script>

<div class="login-page">
  <div class="login-card">
    <h1 class="login-title">Choose a new password</h1>
    <p class="login-subtitle">Enter a new password for your account.</p>

    {#if checking}
      <p class="muted">Verifying link...</p>
    {:else}
      <form onsubmit={handleSubmit}>
        <PasswordField
          bind:value={password}
          id="new-password"
          placeholder="Choose a password"
          showRules
          autocomplete="new-password"
        />

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading || !passwordOk}>
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>

      <p class="signup-prompt">
        <a href="/login">Back to sign in</a>
      </p>
    {/if}
  </div>
</div>

<style>
  .login-page {
    display: grid;
    place-items: center;
    min-height: calc(100vh - 300px);
    padding: var(--space-3);
  }

  .login-card {
    width: 100%;
    max-width: 380px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .login-title {
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-text-primary);
    margin-bottom: var(--space-2);
    text-align: center;
  }

  .login-subtitle {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-align: center;
    margin-bottom: var(--space-3);
  }

  .muted {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-align: center;
  }

  .btn-primary {
    width: 100%;
  }

  .signup-prompt {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    text-align: center;
    margin-top: var(--space-3);
  }

  .signup-prompt a {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
  }

  .signup-prompt a:hover {
    text-decoration: underline;
  }

  .error-text {
    font-size: var(--text-xs);
    color: var(--color-error);
    margin-bottom: var(--space-1);
  }
</style>
