<script lang="ts">
  import { createClient } from '$lib/supabase/client';

  // Shared "check your inbox + enter code" card. Used by:
  //   - /login when the user picks magic-link
  //   - /signup after the confirmation email is sent
  // The parent already triggered signInWithOtp / signUp with the captcha token,
  // so this component only handles the verify step (no captcha needed since
  // verifyOtp validates the token itself).
  interface Props {
    email: string;
    onverified: () => void;
    onback: () => void;
    hint?: string;
  }
  let { email, onverified, onback, hint }: Props = $props();

  const supabase = createClient();

  let code = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (code.length < 6) return;
    error = '';
    loading = true;

    const token = code.trim();
    // Try magiclink first (returning user), then signup (new user). Same flow
    // the original /login used.
    let result = await supabase.auth.verifyOtp({ email, token, type: 'magiclink' });
    if (result.error) {
      result = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    }
    loading = false;

    if (result.error) {
      error = 'Invalid or expired code. Check your email or request a new link.';
      return;
    }
    onverified();
  }
</script>

<p class="login-subtitle">Check your inbox at <strong>{email}</strong></p>
<p class="login-hint">{hint ?? 'Click the link in the email to sign in, or enter the code below.'}</p>

<form onsubmit={handleSubmit}>
  <label class="field-label" for="otp-input">Verification code</label>
  <input
    id="otp-input"
    type="text"
    inputmode="numeric"
    maxlength={8}
    class="field-input otp-input"
    placeholder="00000000"
    bind:value={code}
    oninput={(e) => { code = (e.target as HTMLInputElement).value.replace(/\D/g, ''); }}
  />

  {#if error}
    <p class="error-text">{error}</p>
  {/if}

  <button type="submit" class="btn-primary" disabled={loading || code.length < 6}>
    {loading ? 'Verifying...' : 'Verify code'}
  </button>
</form>

<button class="btn-link" onclick={onback}>Back</button>

<style>
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

  .otp-input {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    letter-spacing: 0.3em;
    text-align: center;
  }

  .btn-primary {
    width: 100%;
  }

  .btn-link {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-primary);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-half);
    margin-top: var(--space-1);
  }

  .btn-link:hover { text-decoration: underline; }

  .error-text {
    font-size: var(--text-xs);
    color: var(--color-error);
    margin-bottom: var(--space-1);
  }
</style>
