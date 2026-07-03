<script lang="ts">
  import type { AccountEventRow } from './+page.server';

  let { data } = $props<{
    data: {
      profile: { id: string; email: string; display_name: string | null; avatar_url: string | null };
      events: AccountEventRow[];
      page: number;
      totalPages: number;
    };
  }>();

  function describe(event: AccountEventRow): string {
    const m = event.metadata ?? {};
    switch (event.event_type) {
      case 'sign_in':
        return 'Signed in';
      case 'role_changed':
        return `Role changed: ${m.from ?? '?'} → ${m.to ?? '?'}`;
      case 'result_uploaded':
        return m.table === 'results_llm' ? 'Uploaded an LLM benchmark result' : 'Uploaded an inference benchmark result';
      case 'result_deleted':
        return m.table === 'results_llm' ? 'Deleted an LLM benchmark result' : 'Deleted an inference benchmark result';
      case 'recipe_deleted': {
        const kindLabel = m.kind === 'llm' ? 'LLM' : 'inference';
        return m.name ? `Deleted ${kindLabel} recipe "${m.name}"` : `Deleted an ${kindLabel} recipe`;
      }
      default:
        return event.event_type;
    }
  }
</script>

<div class="admin-page">
  <header class="page-header">
    <a class="back-link" href="/admin/users">&larr; Back to users</a>
    <div class="user-cell">
      {#if data.profile.avatar_url}
        <img src={data.profile.avatar_url} alt="" class="table-avatar" loading="lazy" crossorigin="anonymous" />
      {/if}
      <div>
        <h1>{data.profile.display_name ?? data.profile.email}</h1>
        <p class="mono muted">{data.profile.email}</p>
      </div>
    </div>
    <p class="investigation-note">
      Use this to investigate a specific support request, abuse report, or account issue — not for general browsing.
    </p>
  </header>

  <div class="users-table-wrapper">
    <table class="users-table">
      <thead>
        <tr>
          <th>Event</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {#each data.events as event}
          <tr>
            <td>{describe(event)}</td>
            <td class="mono">{new Date(event.created_at).toLocaleString()}</td>
          </tr>
        {:else}
          <tr>
            <td colspan="2" class="empty">No recorded account events for this user.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if data.totalPages > 1}
    <nav class="pagination">
      <a class="page-btn" class:disabled={data.page <= 1} href={data.page > 1 ? `?page=${data.page - 1}` : undefined}>
        Previous
      </a>
      <span class="page-info">Page {data.page} of {data.totalPages}</span>
      <a class="page-btn" class:disabled={data.page >= data.totalPages} href={data.page < data.totalPages ? `?page=${data.page + 1}` : undefined}>
        Next
      </a>
    </nav>
  {/if}
</div>

<style>
  .admin-page {
    max-width: 100%;
  }

  .back-link {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-decoration: none;
    display: inline-block;
    margin-bottom: var(--space-2);
    transition: color var(--transition-base);
  }

  .back-link:hover {
    color: var(--color-text-primary);
  }

  .user-cell {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .table-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }

  .investigation-note {
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .muted {
    color: var(--color-text-muted);
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
    text-align: left;
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
    text-align: left;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .users-table tr:last-child td {
    border-bottom: none;
  }

  .users-table tr:hover td {
    background: var(--color-accent-light);
  }

  .empty {
    text-align: center;
    color: var(--color-text-muted);
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
    text-decoration: none;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .page-btn:hover:not(.disabled) {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .page-btn.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .page-info {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
</style>
