<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { createClient } from '$lib/supabase/client';
  import { safeNext, stashNext } from '$lib/utils/login-redirect';
  import { meetsAllRules } from '$lib/utils/password-rules';
  import TurnstileWidget from '$lib/components/auth/TurnstileWidget.svelte';
  import OAuthButtons from '$lib/components/auth/OAuthButtons.svelte';
  import PasswordField from '$lib/components/auth/PasswordField.svelte';
  import OtpVerifyCard from '$lib/components/auth/OtpVerifyCard.svelte';

  const supabase = createClient();

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  let nextDest = $state('/');
  let callbackBase = $state('');

  let view = $state<'form' | 'verify'>('form');

  let turnstileToken = $state('');
  let turnstileWidget: { reset: () => void } | undefined = $state();

  const passwordOk = $derived(meetsAllRules(password));

  onMount(() => {
    if (!browser) return;
    const url = new URL(window.location.href);
    nextDest = safeNext(url.searchParams.get('next'));
    callbackBase = `${window.location.origin}/auth/callback`;
    if (nextDest !== '/') stashNext(nextDest);
  });

  function callbackUrl(): string {
    return nextDest === '/' ? callbackBase : `${callbackBase}?next=${encodeURIComponent(nextDest)}`;
  }

  function navigateNext() {
    window.location.href = nextDest;
  }

  function requireToken(): string | null {
    if (!turnstileToken) {
      error = 'Please complete the verification first.';
      return null;
    }
    return turnstileToken;
  }

  async function handleSignUp(e: Event) {
    e.preventDefault();
    if (!email || !password) return;
    if (!passwordOk) {
      error = 'Password must meet all requirements.';
      return;
    }
    const captchaToken = requireToken();
    if (!captchaToken) return;

    error = '';
    loading = true;

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: callbackUrl(), captchaToken }
    });

    turnstileWidget?.reset();
    loading = false;

    if (!signUpError) {
      view = 'verify';
      return;
    }

    const msg = signUpError.message?.toLowerCase() ?? '';
    if (msg.includes('already registered') || msg.includes('already exists')) {
      error = 'This email is already registered. Try signing in instead.';
    } else if (msg.includes('captcha')) {
      error = 'Verification expired. Please try again.';
    } else if (signUpError.status === 429 || msg.includes('rate limit')) {
      error = 'Too many attempts. Wait a minute and try again.';
    } else {
      error = signUpError.message || 'Could not create account. Please try again.';
    }
  }
</script>

<div class="login-page">
  <div class="login-card">
    {#if view === 'verify'}
      <h1 class="login-title">Confirm your email</h1>
      <OtpVerifyCard
        email={email.trim().toLowerCase()}
        onverified={navigateNext}
        onback={() => { view = 'form'; error = ''; }}
        hint="Click the link in the email to confirm, or enter the code below."
      />
    {:else}
      <h1 class="login-title">Create your account</h1>

      <OAuthButtons {nextDest} {callbackBase} />

      <div class="divider"><span>or continue with email</span></div>

      <form onsubmit={handleSignUp}>
        <label class="field-label" for="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          class="field-input"
          placeholder="you@example.com"
          autocomplete="email"
          bind:value={email}
          required
        />

        <PasswordField
          bind:value={password}
          id="signup-password"
          placeholder="Choose a password"
          showRules
          autocomplete="new-password"
        />

        {#if error}
          <p class="error-text" role="alert">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading || !email || !passwordOk || !turnstileToken}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <TurnstileWidget bind:token={turnstileToken} bind:this={turnstileWidget} />

      <p class="signup-prompt">
        Already have an account?
        <a href={nextDest === '/' ? '/login' : `/login?next=${encodeURIComponent(nextDest)}`}>Sign in</a>
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

  .divider {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: var(--space-2) 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
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
