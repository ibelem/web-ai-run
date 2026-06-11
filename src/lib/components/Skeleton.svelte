<script lang="ts">
  let { width = '100%', height = '16px', rounded = false } = $props();
</script>

<div
  class="skeleton"
  class:rounded
  style="width: {width}; height: {height};"
></div>

<style>
  @keyframes pulse {
    0%, 100% {
      background-color: var(--color-surface-sunken);
    }
    50% {
      background-color: var(--color-border);
    }
  }

  .skeleton {
    animation: pulse 1.5s ease-in-out infinite;
    border-radius: var(--radius-sm);
  }

  .skeleton.rounded {
    border-radius: var(--radius-lg);
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton { animation: none; opacity: 0.6; }
  }
</style>
