<script lang="ts">
  import { enhance } from '$app/forms';
  import { ROLE_HIERARCHY } from '$lib/types/roles';
  import type { UserRow } from './+page.server';

  let { data, form } = $props<{ data: { users: UserRow[] }; form: any }>();
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
        {#each data.users as user}
          <tr>
            <td class="user-cell">
              {#if user.avatar_url}
                <img src={user.avatar_url} alt="" class="table-avatar" crossorigin="anonymous" />
              {/if}
              <span>{user.display_name ?? '—'}</span>
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
</div>

<style>
  .admin-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
  }

  .page-header h1 {
    font-size: var(--text-xl);
    font-weight: 300;
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
  }

  .error-banner {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .success-banner {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-success);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    color: var(--color-success);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .users-table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .users-table th {
    text-align: left;
    padding: var(--space-1) var(--space-2);
    font-weight: 500;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-raised);
    white-space: nowrap;
  }

  .users-table td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .users-table tr:last-child td {
    border-bottom: none;
  }

  .user-cell {
    display: flex;
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
    font-size: var(--text-xs);
  }

  select {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 2px 4px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
  }
</style>
