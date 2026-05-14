<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <span class="error-status">{$page.status}</span>
  <h1 class="error-message">{$page.error?.message ?? 'Something went wrong'}</h1>
  <nav class="error-nav">
    <a href="/" class="error-link">Home</a>
    <a href="/model" class="error-link">Model Browser</a>
    <a href="/run" class="error-link">Run Benchmark</a>
    <a href="/custom" class="error-link">Upload Custom Model</a>
  </nav>
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

  .error-nav {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .error-link {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-primary);
    text-decoration: none;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    transition: border-color var(--transition-base);
  }

  .error-link:hover {
    border-color: var(--color-primary);
  }
</style>
