<script lang="ts">
  import Skeleton from './Skeleton.svelte';
</script>

<div class="skeleton-table">
  {#each Array(5) as _, row}
    <div class="skeleton-row">
      <Skeleton width="40px" height="14px" />
      <Skeleton width="30%" height="14px" />
      <Skeleton width="20%" height="14px" />
      <Skeleton width="15%" height="14px" />
      <Skeleton width="10%" height="14px" />
    </div>
  {/each}
</div>

<style>
  .skeleton-table {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .skeleton-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
  }

  .skeleton-row:last-child {
    border-bottom: none;
  }
</style>
