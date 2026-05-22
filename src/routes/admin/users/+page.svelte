<script lang="ts">
  import { enhance } from '$app/forms';
  import { ROLE_HIERARCHY } from '$lib/types/roles';
  import type { UserRow } from './+page.server';

  let { data, form } = $props<{ data: { users: UserRow[] }; form: any }>();

  const PAGE_SIZE = 50;
  let currentPage = $state(1);

  const totalPages = $derived(Math.ceil(data.users.length / PAGE_SIZE));
  const pagedUsers = $derived(
    data.users.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  );

  function goTo(page: number) {
    if (page >= 1 && page <= totalPages) currentPage = page;
  }
</script>

<div class="admin-page">
  <header class="page-header">
    <h1>User Management</h1>
    <p>{data.users.length} registered users</p>
  </header>

  {#if form?.error}
    <div class="error-banner">
      <p>{form.error}</p>
    </div>
  {/if}

  {#if form?.success}
    <div class="success-banner">
      <p>Role updated successfully.</p>
    </div>
  {/if}

  <div class="users-table-wrapper">
    <table class="users-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Email</th>
          <th>Organization</th>
          <th>Title</th>
          <th>Role</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        {#each pagedUsers as user}
          <tr>
            <td>
              <div class="user-cell">
                {#if user.avatar_url}
                  <img src={user.avatar_url} alt="" class="table-avatar" loading="lazy" crossorigin="anonymous" />
                {/if}
                <span>{user.display_name ?? '—'}</span>
              </div>
            </td>
            <td class="mono">{user.email}</td>
            <td>{user.organization ?? '—'}</td>
            <td>{user.job_title ?? '—'}</td>
            <td>
              <form method="POST" action="?/setRole" use:enhance>
                <input type="hidden" name="user_id" value={user.id} />
                <select name="role" onchange={(e) => (e.target as HTMLSelectElement).form?.requestSubmit()}>
                  {#each ROLE_HIERARCHY as role}
                    <option value={role} selected={user.role === role}>{role}</option>
                  {/each}
                </select>
              </form>
            </td>
            <td class="mono">{new Date(user.created_at).toLocaleDateString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if totalPages > 1}
    <nav class="pagination">
      <button class="page-btn" disabled={currentPage === 1} onclick={() => goTo(currentPage - 1)}>
        Previous
      </button>
      <span class="page-info">Page {currentPage} of {totalPages}</span>
      <button class="page-btn" disabled={currentPage === totalPages} onclick={() => goTo(currentPage + 1)}>
        Next
      </button>
    </nav>
  {/if}
</div>

<style>
  .admin-page {
    max-width: 100%;
  }
  
  .error-banner {
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-2);
  }

  .success-banner {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-success);
    border-radius: var(--radius-lg);
    background: var(--color-surface-sunken);
    color: var(--color-success);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .users-table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .users-table th {
    text-align: center;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-sunken);
    white-space: nowrap;
  }

  .users-table td {
    text-align: center;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .users-table tr:last-child td {
    border-bottom: none;
  }

  .users-table tr:hover td {
    background:var(--color-accent-light);
  }

  .user-cell {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-1);
  }

  .table-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }

  .mono {
    font-family: var(--font-mono);
  }

  select {
    font-family: var(--font-ui);
    font-size: inherit;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  select:focus {
    border-color: var(--color-primary);
    outline: 2px solid var(--color-focus-ring);
    outline-offset: 0;
    opacity: 0.3;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .page-btn {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 8px 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
    background:var(--color-accent-light);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
</style>
