<script lang="ts">
  import { createClient } from '$lib/supabase/client';
  import { stashNext } from '$lib/utils/login-redirect';

  // Shared OAuth row. Currently only GitHub is enabled; Google + Microsoft are
  // stubbed until the company-account admin-consent flow is sorted.
  // OAuth bounces through the provider before Supabase's CAPTCHA gate runs,
  // so this component does NOT consume a Turnstile token. The parent should
  // still mount one for the email/password path.
  interface Props {
    nextDest: string;
    callbackBase: string; // origin/auth/callback
    disabled?: boolean;
  }
  let { nextDest, callbackBase, disabled = false }: Props = $props();

  const supabase = createClient();

  function callbackUrl(): string {
    return nextDest === '/' ? callbackBase : `${callbackBase}?next=${encodeURIComponent(nextDest)}`;
  }

  async function signInOAuth(provider: 'github' | 'google' | 'azure') {
    if (nextDest !== '/') stashNext(nextDest);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() }
    });
  }
</script>

<div class="oauth-section">
  <button class="btn-oauth-github" onclick={() => signInOAuth('github')} {disabled}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
    Continue with GitHub
  </button>
</div>

<style>
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

  .btn-oauth-github:hover:not(:disabled) {
    background: var(--color-accent-light);
    border-color: var(--color-primary);
  }

  .btn-oauth-github:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
