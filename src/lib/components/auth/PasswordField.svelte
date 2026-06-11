<script lang="ts">
  import { PASSWORD_RULES } from '$lib/utils/password-rules';

  // Password input with show/hide toggle and (optional) live requirements.
  // Replaces the confirm-password pattern: typos are caught by the show
  // toggle, not by re-typing into a second field.
  interface Props {
    value: string;
    id?: string;
    label?: string;
    placeholder?: string;
    showRules?: boolean;
    autocomplete?: 'current-password' | 'new-password';
    forgotHref?: string;
  }
  let {
    value = $bindable(''),
    id = 'password-input',
    label = 'Password',
    placeholder = 'Enter your password',
    showRules = false,
    autocomplete = 'current-password',
    forgotHref
  }: Props = $props();

  let revealed = $state(false);
</script>

<div class="field">
  <div class="field-label-row">
    <label class="field-label" for={id}>{label}</label>
    {#if forgotHref}
      <a class="forgot-link" href={forgotHref}>Forgot?</a>
    {/if}
  </div>
  <div class="input-wrapper">
    <input
      {id}
      type={revealed ? 'text' : 'password'}
      class="field-input"
      {placeholder}
      bind:value
      {autocomplete}
    />
    <button
      type="button"
      class="reveal-toggle"
      onclick={() => { revealed = !revealed; }}
      aria-label={revealed ? 'Hide password' : 'Show password'}
    >
      {#if revealed}
        <!-- eye-off -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.45 18.45 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      {:else}
        <!-- eye -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      {/if}
    </button>
  </div>

  {#if showRules}
    <ul class="rules">
      {#each PASSWORD_RULES as rule}
        {@const met = rule.test(value)}
        <li class="rule" class:met>
          <span class="rule-icon" aria-hidden="true">{met ? '✓' : '·'}</span>
          {rule.label}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .field {
    margin-bottom: var(--space-2);
  }

  .field-label-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-half);
  }

  .field-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .forgot-link {
    font-size: var(--text-xs);
    color: var(--color-primary);
    text-decoration: none;
  }

  .forgot-link:hover {
    text-decoration: underline;
  }

  .input-wrapper {
    position: relative;
  }

  .field-input {
    width: 100%;
    padding-right: 36px;
  }

  .field-input:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .reveal-toggle {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    padding: 4px;
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reveal-toggle:hover {
    color: var(--color-text-primary);
  }

  .rules {
    list-style: none;
    padding: 0;
    margin: var(--space-1) 0 0;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .rule {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .rule-icon {
    width: 12px;
    text-align: center;
  }

  .rule.met {
    color: var(--color-success);
  }
</style>
