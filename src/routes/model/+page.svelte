<script lang="ts">
  import { isAuthenticated } from '$lib/stores/auth';
  import { canRunBenchmark } from '$lib/guards/benchmark-guard';

  let guardResult = $derived(canRunBenchmark($isAuthenticated, 'model'));
</script>

<h1>Model Benchmark</h1>
<p>Run a single model benchmark. Available to all users.</p>

<button class="btn-primary" disabled={!guardResult.allowed}>
  Run Benchmark
</button>

<style>
  h1 {
    font-size: var(--text-xl);
    font-weight: 300;
    margin-bottom: var(--space-1);
  }

  p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  .btn-primary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 400;
    padding: var(--space-1) var(--space-2);
    min-height: 44px;
    background: var(--color-text-primary);
    color: var(--color-surface);
    border: none;
    border-radius: var(--radius-base);
    cursor: pointer;
    transition: opacity var(--transition-base);
  }

  .btn-primary:hover {
    opacity: 0.85;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary:focus {
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 2px;
  }
</style>
