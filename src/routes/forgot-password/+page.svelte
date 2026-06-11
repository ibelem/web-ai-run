<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { createClient } from '$lib/supabase/client';
  import TurnstileWidget from '$lib/components/auth/TurnstileWidget.svelte';

  const supabase = createClient();

  let email = $state('');
  let error = $state('');
  let loading = $state(false);
  // Always show the same "check your inbox" message after submit, regardless
  // of whether the email is registered. Don't leak account existence here
  // (the email-probe flow used to leak this; we deliberately don't anymore).
  let sent = $state(false);

  let turnstileToken = $state('');
  let turnstileWidget: { reset: () => void } | undefined = $state();

  let resetCallback = $state('');
  let expiredLink = $state(false);

  onMount(() => {
    if (!browser) return;
    resetCallback = `${window.location.origin}/auth/callback?next=/reset-password`;
    expiredLink = new URL(window.location.href).searchParams.get('expired') === '1';
  });

  function requireToken(): string | null {
    if (!turnstileToken) {
      error = 'Please complete the verification first.';
      return null;
    }
    return turnstileToken;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!email) return;
    const captchaToken = requireToken();
    if (!captchaToken) return;

    error = '';
    loading = true;

    // Supabase returns success even when the email is unknown — that's the
    // intended behaviour for forgot-password and matches what we want.
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: resetCallback,
      captchaToken
    });

    turnstileWidget?.reset();
    loading = false;
    sent = true;
  }
</script>

<div class="login-page">
  <div class="login-card">
    {#if sent}
      <h1 class="login-title">Check your email</h1>
      <p class="login-subtitle">
        If an account exists for <strong>{email}</strong>, we've sent a link to reset your password.
      </p>
      <p class="login-hint">The link expires in 1 hour. Don't see it? Check spam, or try again in a minute.</p>
      <a href="/login" class="btn-link-block">Back to sign in</a>
    {:else}
      <h1 class="login-title">Reset your password</h1>
      {#if expiredLink}
        <p class="expired-banner">Your reset link has expired. Request a new one below.</p>
      {:else}
        <p class="login-subtitle">Enter the email associated with your account.</p>
      {/if}

      <form onsubmit={handleSubmit}>
        <label class="field-label" for="reset-email">Email</label>
        <input
          id="reset-email"
          type="email"
          class="field-input"
          placeholder="you@example.com"
          autocomplete="email"
          bind:value={email}
          required
        />

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading || !email || !turnstileToken}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <TurnstileWidget bind:token={turnstileToken} bind:this={turnstileWidget} />

      <p class="signup-prompt">
        Remembered it?
        <a href="/login">Sign in</a>
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
    margin-bottom: var(--space-3);
    text-align: center;
  }

  .login-subtitle {
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    margin-bottom: var(--space-2);
    text-align: center;
  }

  .login-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-bottom: var(--space-3);
    text-align: center;
  }

  .expired-banner {
    font-size: var(--text-sm);
    color: var(--color-warning, #b45309);
    background: var(--color-warning-bg, #fef3c7);
    border: 1px solid var(--color-warning-border, #fde68a);
    border-radius: var(--radius-base);
    padding: var(--space-1) var(--space-2);
    margin-bottom: var(--space-3);
    text-align: center;
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
    margin-bottom: var(--space-2);
  }

  .btn-primary {
    width: 100%;
  }

  .btn-link-block {
    display: block;
    text-align: center;
    font-size: var(--text-sm);
    color: var(--color-primary);
    text-decoration: none;
    margin-top: var(--space-3);
  }

  .btn-link-block:hover {
    text-decoration: underline;
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
