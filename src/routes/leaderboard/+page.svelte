<script lang="ts">
  let { data } = $props();
</script>

<div class="leaderboard-page">
  <header class="page-header">
    <h1>Leaderboard</h1>
    <p>Compare benchmark results across models, backends, and hardware.</p>
  </header>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load results: {data.error}</p>
    </div>
  {/if}
</div>

<style>
  .leaderboard-page {
    max-width: 100%;
  }

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
  }
</style>
