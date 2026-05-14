<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <span class="error-status">{$page.status}</span>
  <h1 class="error-message">{$page.error?.message ?? 'Something went wrong'}</h1>
  <a href="/" class="error-link">Go home</a>
</div>

<style>
  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    gap: var(--space-2);
  }

  .error-status {
    font-family: var(--font-mono);
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--color-text-muted);
  }

  .error-message {
    font-family: var(--font-ui);
    font-size: var(--text-lg);
    font-weight: 500;
    color: var(--color-text-primary);
    margin: 0;
  }

  .error-link {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    text-decoration: underline;
    margin-top: var(--space-1);
  }

  .error-link:hover {
    color: var(--color-text-primary);
  }
</style>
