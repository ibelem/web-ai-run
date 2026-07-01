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
  <header class="page-header page-header-row">
    <div class="page-header-text">
      <h1>User Management</h1>
      <p>{data.users.length} registered users</p>
    </div>
    <a href="/admin/export" class="btn-export" download>Export SQL</a>
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

  <!-- Desktop / wide-viewport table -->
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
          <th>Last visited</th>
          <th></th>
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
            <td class="mono">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : '—'}</td>
            <td><a class="investigate-link" href={`/admin/users/${user.id}`}>Investigate</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Mobile card list. CSS swaps which view is visible at <=640px. -->
  <ul class="users-cards">
    {#each pagedUsers as user}
      <li class="user-card">
        <div class="user-card-head">
          {#if user.avatar_url}
            <img src={user.avatar_url} alt="" class="table-avatar" loading="lazy" crossorigin="anonymous" />
          {/if}
          <div class="user-card-name">
            <span class="user-card-display">{user.display_name ?? '—'}</span>
            <span class="user-card-email mono">{user.email}</span>
          </div>
        </div>
        <dl class="user-card-meta">
          {#if user.organization}
            <div class="user-card-row"><dt>Org</dt><dd>{user.organization}</dd></div>
          {/if}
          {#if user.job_title}
            <div class="user-card-row"><dt>Title</dt><dd>{user.job_title}</dd></div>
          {/if}
          <div class="user-card-row"><dt>Joined</dt><dd class="mono">{new Date(user.created_at).toLocaleDateString()}</dd></div>
          <div class="user-card-row"><dt>Last visited</dt><dd class="mono">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : '—'}</dd></div>
          <div class="user-card-row user-card-row-role">
            <dt>Role</dt>
            <dd>
              <form method="POST" action="?/setRole" use:enhance>
                <input type="hidden" name="user_id" value={user.id} />
                <select name="role" class="user-card-role-select" onchange={(e) => (e.target as HTMLSelectElement).form?.requestSubmit()}>
                  {#each ROLE_HIERARCHY as role}
                    <option value={role} selected={user.role === role}>{role}</option>
                  {/each}
                </select>
              </form>
            </dd>
          </div>
        </dl>
        <a class="investigate-link" href={`/admin/users/${user.id}`}>Investigate</a>
      </li>
    {/each}
  </ul>

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

  .btn-export {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background var(--transition-base);
  }

  .btn-export:hover {
    background: var(--color-primary-hover);
  }
  
  .error-banner {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-2);
  }

  .success-banner {
    padding: var(--space-1) var(--space-3);
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
    padding: var(--space-1) var(--space-3);
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
    padding: var(--space-1) var(--space-3);
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

  .investigate-link {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-secondary);
    text-decoration: none;
    white-space: nowrap;
    transition: color var(--transition-base), border-color var(--transition-base);
  }

  .investigate-link:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  select {
    cursor: pointer;
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

  /* ── Mobile card list ─────────────────────────────────────────────────
     The data table doesn't compress well below ~640px — six columns plus
     a role <select> means horizontal scrolling and tiny tap targets.
     Below 640px we render each user as a vertically-stacked card instead. */
  .users-cards {
    display: none;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  @media (max-width: 640px) {
    .users-table-wrapper { display: none; }

    .users-cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .user-card {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-base);
      background: var(--color-surface);
      padding: var(--space-2);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .user-card-head {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }
    .user-card-head .table-avatar {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
    }
    .user-card-name {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .user-card-display {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--color-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .user-card-email {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-card-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding-top: var(--space-1);
      border-top: 1px solid var(--color-border);
    }
    .user-card-row {
      display: grid;
      grid-template-columns: 60px 1fr;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-xs);
    }
    .user-card-row dt {
      font-weight: 500;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 10px;
    }
    .user-card-row dd {
      margin: 0;
      color: var(--color-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .user-card-row-role dd { white-space: normal; }
    .user-card-role-select {
      width: 100%;
      min-height: 32px;
    }

    .pagination {
      gap: var(--space-1);
    }
    .page-btn {
      padding: 6px 12px;
      font-size: var(--text-sm);
    }
  }
</style>
