<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { createClient } from '$lib/supabase/client';
  import { safeNext, stashNext } from '$lib/utils/login-redirect';

  type View = 'email' | 'password' | 'signup' | 'otp' | 'forgot-sent';

  let view = $state<View>('email');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let otpCode = $state('');
  let error = $state('');
  let loading = $state(false);
  let magicLinkLoading = $state(false);
  let otpLoading = $state(false);

  // Where to send the user after a successful sign-in. Read from ?next= on
  // mount, falls back to '/'. Stashed in sessionStorage so OAuth round-trips
  // and email-link flows can recover it on the callback.
  let nextDest = $state('/');

  onMount(() => {
    if (!browser) return;
    const url = new URL(window.location.href);
    nextDest = safeNext(url.searchParams.get('next'));
    if (nextDest !== '/') stashNext(nextDest);
  });

  function navigateNext() {
    window.location.href = nextDest;
  }

  function callbackUrl(): string {
    const base = `${window.location.origin}/auth/callback`;
    return nextDest === '/' ? base : `${base}?next=${encodeURIComponent(nextDest)}`;
  }

  const supabase = createClient();

  async function signInOAuth(provider: 'github' | 'google' | 'azure') {
    if (nextDest !== '/') stashNext(nextDest);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() }
    });
  }

  async function handleEmailContinue(e: Event) {
    e.preventDefault();
    if (!email) return;
    error = '';
    loading = true;

    // Try signing in with a dummy password to check if user exists
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: '__probe__',
    });

    loading = false;

    if (authError?.message?.toLowerCase().includes('invalid login credentials')) {
      // User exists but wrong password — show password field
      view = 'password';
    } else if (authError?.message?.toLowerCase().includes('email not confirmed')) {
      // User exists but unconfirmed — send magic link
      await sendMagicLink();
    } else {
      // User doesn't exist — show sign-up form
      view = 'signup';
    }
  }

  async function signInPassword(e: Event) {
    e.preventDefault();
    if (!email || !password) return;
    error = '';
    loading = true;

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    loading = false;

    if (authError) {
      error = 'Invalid password';
      return;
    }
    navigateNext();
  }

  async function signUp(e: Event) {
    e.preventDefault();
    if (!email || !password) return;
    if (password.length < 8) {
      error = 'Password must be at least 8 characters';
      return;
    }
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }
    error = '';
    loading = true;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl(),
      },
    });

    loading = false;

    if (signUpError) {
      if (signUpError.message?.toLowerCase().includes('already registered')) {
        error = 'This email is already registered. Try signing in instead.';
        view = 'password';
      } else {
        error = signUpError.message || 'Could not create account. Please try again.';
      }
      return;
    }

    view = 'otp';
  }

  async function sendMagicLink() {
    if (!email) {
      error = 'Enter your email first';
      return;
    }
    error = '';
    magicLinkLoading = true;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl(),
      },
    });

    magicLinkLoading = false;

    if (otpError) {
      if (otpError.status === 429 || otpError.message?.toLowerCase().includes('rate limit')) {
        view = 'otp';
      } else {
        error = 'Could not send login link. Please try again.';
      }
      return;
    }
    view = 'otp';
  }

  async function verifyOtp(e: Event) {
    e.preventDefault();
    if (otpCode.length < 6) return;
    error = '';
    otpLoading = true;

    const token = otpCode.trim();

    // Try 'magiclink' first (returning user), then 'signup' (new user)
    let result = await supabase.auth.verifyOtp({ email, token, type: 'magiclink' });
    if (result.error) {
      result = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    }

    otpLoading = false;

    if (result.error) {
      error = 'Invalid or expired code. Check your email or request a new link.';
      return;
    }

    navigateNext();
  }

  async function resetPassword() {
    if (!email) {
      error = 'Enter your email first';
      return;
    }
    error = '';

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/set-password`,
    });

    if (resetError) {
      error = resetError.message || 'Could not send reset link.';
      return;
    }
    view = 'forgot-sent';
  }

  function goBack() {
    view = 'email';
    password = '';
    confirmPassword = '';
    otpCode = '';
    error = '';
  }
</script>

<div class="login-page">
  <div class="login-card">
    <h1 class="login-title">Sign in</h1>

    {#if view === 'otp'}
      <p class="login-subtitle">Check your inbox at <strong>{email}</strong></p>
      <p class="login-hint">Click the link in the email to sign in, or enter the code below.</p>

      <form onsubmit={verifyOtp}>
        <label class="field-label" for="otp-input">Verification code</label>
        <input
          id="otp-input"
          type="text"
          inputmode="numeric"
          maxlength={8}
          class="field-input otp-input"
          placeholder="00000000"
          bind:value={otpCode}
          oninput={(e) => { otpCode = (e.target as HTMLInputElement).value.replace(/\D/g, ''); }}
        />

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={otpLoading || otpCode.length < 6}>
          {otpLoading ? 'Verifying...' : 'Verify code'}
        </button>
      </form>

      <button class="btn-link" onclick={goBack}>Back</button>

    {:else if view === 'forgot-sent'}
      <p class="login-subtitle">Check your inbox for a password reset link.</p>
      <p class="login-hint">If you have an account with <strong>{email}</strong>, you'll receive an email shortly.</p>
      <button class="btn-link" onclick={goBack}>Back to sign in</button>

    {:else if view === 'password'}
      <p class="login-subtitle">Welcome back</p>
      <form onsubmit={signInPassword}>
        <label class="field-label" for="email-display">Email</label>
        <input
          id="email-display"
          type="email"
          class="field-input"
          value={email}
          disabled
        />

        <label class="field-label" for="password-input">Password</label>
        <input
          id="password-input"
          type="password"
          class="field-input"
          placeholder="Enter your password"
          bind:value={password}
        />

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading || !password}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div class="alt-actions">
        <button class="btn-magic" onclick={sendMagicLink} disabled={magicLinkLoading}>
          {magicLinkLoading ? 'Sending...' : 'Send me a magic link instead'}
        </button>
        <button class="btn-link" onclick={resetPassword}>Forgot password?</button>
        <button class="btn-link" onclick={goBack}>Use a different email</button>
      </div>

    {:else if view === 'signup'}
      <p class="login-subtitle">Create your account</p>
      <form onsubmit={signUp}>
        <label class="field-label" for="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          class="field-input"
          value={email}
          disabled
        />

        <label class="field-label" for="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          class="field-input"
          placeholder="At least 8 characters"
          bind:value={password}
          minlength={8}
        />

        <label class="field-label" for="signup-confirm">Confirm password</label>
        <input
          id="signup-confirm"
          type="password"
          class="field-input"
          placeholder="Confirm password"
          bind:value={confirmPassword}
          minlength={8}
        />

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading || !password || !confirmPassword}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div class="alt-actions">
        <button class="btn-link" onclick={goBack}>Use a different email</button>
      </div>

    {:else}
      <!-- OAuth Providers -->
      <div class="oauth-section">
        <button class="btn-oauth-github" onclick={() => signInOAuth('github')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Continue with GitHub
        </button>

        <!-- hidden until admin consent flow is resolved for company accounts -->
        <div class="oauth-more" style="display:none">
          <button class="btn-oauth" onclick={() => signInOAuth('google')} aria-label="Sign in with Google">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </button>
          <button class="btn-oauth" onclick={() => signInOAuth('azure')} aria-label="Sign in with Microsoft">
            <svg width="22" height="22" viewBox="0 0 23 23">
              <path d="M0 0h10.931v10.931H0z" fill="#F25022"/>
              <path d="M12.069 0H23v10.931H12.069z" fill="#7FBA00"/>
              <path d="M0 12.069h10.931V23H0z" fill="#00A4EF"/>
              <path d="M12.069 12.069H23V23H12.069z" fill="#FFB900"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="divider">
        <span>or continue with email</span>
      </div>

      <!-- Email-first flow -->
      <form onsubmit={handleEmailContinue}>
        <label class="field-label" for="email-input">Email</label>
        <input
          id="email-input"
          type="email"
          class="field-input"
          placeholder="you@example.com"
          bind:value={email}
          required
        />

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <button type="submit" class="btn-primary" disabled={loading || !email}>
          {loading ? 'Checking...' : 'Continue'}
        </button>
      </form>
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
    margin-bottom: var(--space-2);
  }

  .oauth-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .btn-oauth-github {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    height: 44px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .btn-oauth-github:hover {
    background: var(--color-accent-light);
    border-color: var(--color-primary);
  }

  .oauth-more {
    display: flex;
    justify-content: center;
    gap: var(--space-2);
  }

  .btn-oauth {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .btn-oauth:hover {
    background: var(--color-accent-light);
    border-color: var(--color-primary);
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

  .field-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .field-input:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .otp-input {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    letter-spacing: 0.3em;
    text-align: center;
  }

  .btn-primary {
    width: 100%;
  }

  .alt-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
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
    min-height: 40px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-magic:hover {
    background: var(--color-accent-light);
  }

  .btn-magic:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-link {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-primary);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-half);
  }

  .btn-link:hover { text-decoration: underline; }

  .error-text {
    font-size: var(--text-xs);
    color: var(--color-error);
    margin-bottom: var(--space-1);
  }
</style>
