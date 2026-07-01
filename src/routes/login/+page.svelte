<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { createClient } from '$lib/supabase/client';
  import { safeNext, stashNext } from '$lib/utils/login-redirect';
  import TurnstileWidget from '$lib/components/auth/TurnstileWidget.svelte';
  import OAuthButtons from '$lib/components/auth/OAuthButtons.svelte';
  import PasswordField from '$lib/components/auth/PasswordField.svelte';
  import OtpVerifyCard from '$lib/components/auth/OtpVerifyCard.svelte';

  const supabase = createClient();

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);
  let magicLinkLoading = $state(false);

  let nextDest = $state('/');
  let callbackBase = $state('');

  // Two states only: the form itself, or "waiting for OTP after magic link."
  // Signup and forgot-password live on dedicated routes now.
  let view = $state<'form' | 'magic-sent'>('form');

  let turnstileToken = $state('');
  let turnstileWidget: { reset: () => void } | undefined = $state();

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

  async function handleSignIn(e: Event) {
    e.preventDefault();
    if (!email || !password) return;
    const captchaToken = requireToken();
    if (!captchaToken) return;

    error = '';
    loading = true;

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
      options: { captchaToken }
    });

    turnstileWidget?.reset();
    loading = false;

    if (!authError) {
      if (data.user) {
        // Awaited (not fire-and-forget) — navigateNext() does a full page
        // navigation next, which would otherwise cancel an in-flight insert.
        await (supabase.from('account_events') as any).insert({ user_id: data.user.id, event_type: 'sign_in' });
      }
      navigateNext();
      return;
    }

    const msg = authError.message?.toLowerCase() ?? '';
    if (msg.includes('invalid login credentials')) {
      // Same response Supabase returns for "wrong password" and "no such user."
      // Don't try to disambiguate — just say so honestly.
      error = "Incorrect email or password. If you don't have an account yet, sign up first.";
    } else if (msg.includes('email not confirmed')) {
      error = 'Please confirm your email first. Check your inbox for the link, or use a magic link below.';
    } else if (msg.includes('captcha')) {
      error = 'Verification expired. Please try again.';
    } else if (authError.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
      error = 'Too many attempts. Wait a minute and try again.';
    } else {
      error = authError.message || 'Could not sign in. Please try again.';
    }
  }

  async function sendMagicLink() {
    if (!email) {
      error = 'Enter your email first.';
      return;
    }
    const captchaToken = requireToken();
    if (!captchaToken) return;

    error = '';
    magicLinkLoading = true;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: callbackUrl(), captchaToken }
    });

    turnstileWidget?.reset();
    magicLinkLoading = false;

    if (otpError && otpError.status !== 429 && !otpError.message?.toLowerCase().includes('rate limit')) {
      const msg = otpError.message?.toLowerCase() ?? '';
      if (msg.includes('captcha')) {
        error = 'Verification expired. Please try again.';
      } else {
        error = 'Could not send login link. Please try again.';
      }
      return;
    }
    // For 429 we still flip to the OTP view — Supabase's rate limit just means
    // "you already requested one"; the link they just got still works.
    view = 'magic-sent';
  }
</script>

<div class="login-page">
  <div class="login-card">
    {#if view === 'magic-sent'}
      <h1 class="login-title">Check your email</h1>
      <OtpVerifyCard
        email={email.trim().toLowerCase()}
        onverified={navigateNext}
        onback={() => { view = 'form'; error = ''; }}
      />
    {:else}
      <h1 class="login-title">Sign in</h1>

      <OAuthButtons {nextDest} {callbackBase} />

      <div class="divider"><span>or continue with email</span></div>

      <form onsubmit={handleSignIn}>
        <label class="field-label" for="email-input">Email</label>
        <input
          id="email-input"
          type="email"
          class="field-input"
          placeholder="you@example.com"
          autocomplete="email"
          bind:value={email}
          required
        />

        <PasswordField
          bind:value={password}
          forgotHref="/forgot-password"
        />

        {#if error}
          <p class="error-text" role="alert">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading || !email || !password || !turnstileToken}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <TurnstileWidget bind:token={turnstileToken} bind:this={turnstileWidget} />

      <div class="alt-actions">
        <button class="btn-magic" onclick={sendMagicLink} disabled={magicLinkLoading || !email || !turnstileToken}>
          {magicLinkLoading ? 'Sending...' : 'Email me a magic link instead'}
        </button>
      </div>

      <p class="signup-prompt">
        Don't have an account?
        <a href={nextDest === '/' ? '/signup' : `/signup?next=${encodeURIComponent(nextDest)}`}>Sign up</a>
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
    min-width: 0;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-sizing: border-box;
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

  .alt-actions {
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }

  .btn-magic {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-magic:hover:not(:disabled) {
    background: var(--color-accent-light);
  }

  .btn-magic:disabled { opacity: 0.5; cursor: not-allowed; }

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
