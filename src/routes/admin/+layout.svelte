<script lang="ts">
  import { page } from '$app/stores';

  let { children } = $props();
</script>

<div class="admin-layout">
  <nav class="admin-subnav">
    <a href="/admin/users" class="subnav-item" class:active={$page.url.pathname === '/admin/users'}>
      Users
    </a>
    <a href="/admin/orgs" class="subnav-item" class:active={$page.url.pathname === '/admin/orgs'}>
      Orgs
    </a>
    <a href="/admin/models" class="subnav-item" class:active={$page.url.pathname === '/admin/models'}>
      Models
    </a>
  </nav>

  {@render children()}
</div>

<style>
  .admin-layout {
    max-width: 100%;
  }

  .admin-subnav {
    display: flex;
    gap: var(--space-half);
    margin-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
    padding-bottom: var(--space-1);
  }

  .subnav-item {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    padding: var(--space-half) var(--space-1);
    border-radius: var(--radius-sm);
    transition: color var(--transition-base), background var(--transition-base);
  }

  .subnav-item:hover {
    color: var(--color-text-primary);
    background: var(--color-nav-item-hover);
  }

  .subnav-item.active {
    color: var(--color-primary);
    background: var(--color-accent-light);
  }
</style>
