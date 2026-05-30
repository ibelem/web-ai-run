<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { invalidateOverridesCache, syncOverridesCache } from '$lib/overrides-cache';

  let { data, form } = $props<{
    data: {
      overrides: Array<{ id: string; hf_model_id: string; file_path: string; overrides: Record<string, number>; updated_at: string; updated_by: string | null; updated_by_name: string | null; updated_by_avatar: string | null }>;
      role: string;
      userId: string;
    };
    form: { success?: boolean; error?: string } | null;
  }>();

  function canManage(item: typeof data.overrides[0]): boolean {
    if (['intel', 'admin'].includes(data.role)) return true;
    return item.updated_by === data.userId;
  }

  let filterQuery = $state('');
  const filteredOverrides = $derived(
    filterQuery.trim()
      ? data.overrides.filter(m =>
          m.hf_model_id.toLowerCase().includes(filterQuery.toLowerCase()) ||
          m.file_path.toLowerCase().includes(filterQuery.toLowerCase())
        )
      : data.overrides
  );

  let syncing = $state(false);
  let syncDone = $state(false);

  async function handleSync() {
    syncing = true;
    syncDone = false;
    try {
      await syncOverridesCache();
      syncDone = true;
      setTimeout(() => { syncDone = false; }, 2000);
    } finally {
      syncing = false;
    }
  }

  let editingId = $state<string | null>(null);
  let editValue = $state('');

  type CheckStatus = 'idle' | 'checking' | 'ok' | 'not-found' | 'error';
  let checkStatuses = $state<Record<string, CheckStatus>>({});
  let checking = $state(false);

  async function checkAllModels() {
    checking = true;
    const initial: Record<string, CheckStatus> = {};
    for (const m of filteredOverrides) {
      initial[m.id] = 'checking';
    }
    checkStatuses = initial;
    await Promise.all(filteredOverrides.map(async (m: { id: string; hf_model_id: string; file_path: string }) => {
      const url = `https://huggingface.co/${m.hf_model_id}/resolve/main/${m.file_path}`;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        checkStatuses[m.id] = res.ok ? 'ok' : res.status === 404 ? 'not-found' : 'error';
      } catch {
        checkStatuses[m.id] = 'error';
      }
    }));
    checking = false;
  }

  function formatOverrides(obj: Record<string, number>): string {
    return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', ');
  }

  function startEdit(item: typeof data.overrides[0]) {
    editingId = item.id;
    editValue = formatOverrides(item.overrides);
  }

  function cancelEdit() {
    editingId = null;
    editValue = '';
  }

  function pairItems<T>(arr: T[]): [T, T | null][] {
    const pairs: [T, T | null][] = [];
    for (let i = 0; i < arr.length; i += 2) {
      pairs.push([arr[i], arr[i + 1] ?? null]);
    }
    return pairs;
  }
</script>

<div class="page">
  <header class="page-header">
    <div class="page-header-text">
      <h1>Free Dimension Overrides</h1>
      <p>Manage ONNX Runtime <code>freeDimensionOverrides</code> for models with dynamic input shapes.</p>
    </div>
    <div class="page-header-actions">
      {#if data.overrides.length > 0}
        <input class="search-input" type="search" placeholder="Filter models…" bind:value={filterQuery} />
        <button class="btn btn-check" onclick={checkAllModels} disabled={checking} title="Check if all model files are reachable on HuggingFace">
          {#if checking}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          {/if}
          Check All
        </button>
      {/if}
      <a href="/onnx/overrides/import" class="btn btn-secondary">Import</a>
      <a href="/onnx/overrides/new" class="btn btn-primary">Add Override</a>
      <button class="btn btn-sync" onclick={handleSync} disabled={syncing} title="Force re-fetch overrides from database into local cache">
        {#if syncing}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        {:else if syncDone}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        {/if}
        {syncDone ? 'Synced!' : 'Sync Cache'}
      </button>
    </div>
  </header>

  {#if form?.error}
    <div class="error-banner">{form.error}</div>
  {/if}

  {#if data.overrides.length === 0}
    <div class="empty">
      <p>No overrides configured yet.</p>
      <p class="empty-hint">Add overrides for models that have dynamic input shapes (symbolic dimensions).</p>
    </div>
  {:else}
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>File Path</th>
            <th>Overrides</th>
            <th class="col-updated">By</th>
            <th class="col-actions">Actions</th>
            <th class="col-right">Model</th>
            <th class="col-right">File Path</th>
            <th class="col-right">Overrides</th>
            <th class="col-right col-updated">By</th>
            <th class="col-right col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each pairItems(filteredOverrides) as [left, right]}
            <tr>
              <!-- Left item -->
              <td class="cell-repo">
                <a href="https://huggingface.co/{left.hf_model_id}" target="_blank" rel="noopener" title={left.hf_model_id}>{left.hf_model_id}</a>
              </td>
              <td class="cell-path" title={left.file_path}><code>{left.file_path}</code></td>
              <td class="cell-overrides">
                {#if editingId === left.id}
                  <form method="POST" action="?/update" use:enhance={() => {
                    return async ({ result, update }) => {
                      if (result.type === 'success') {
                        invalidateOverridesCache();
                        editingId = null;
                      }
                      await update({ reset: false });
                    };
                  }}>
                    <input type="hidden" name="id" value={left.id} />
                    <input type="text" name="overrides" class="edit-input" bind:value={editValue} placeholder="batch_size: 1, height: 224, width: 224" />
                    <div class="edit-actions">
                      <button type="submit" class="btn-sm btn-save">Save</button>
                      <button type="button" class="btn-sm btn-cancel" onclick={cancelEdit}>Cancel</button>
                    </div>
                  </form>
                {:else}
                  <code class="overrides-display">{formatOverrides(left.overrides)}</code>
                {/if}
              </td>
              <td class="col-updated">
                {#if left.updated_by_name}
                  <span class="updated-user" title="{left.updated_by_name} · {new Date(left.updated_at).toLocaleDateString()}">
                    {#if left.updated_by_avatar}
                      <img class="user-avatar" src={left.updated_by_avatar} alt="" crossorigin="anonymous" />
                    {:else}
                      <span class="user-avatar user-avatar-placeholder">{left.updated_by_name[0]?.toUpperCase()}</span>
                    {/if}
                    <span class="user-name">{left.updated_by_name}</span>
                  </span>
                {/if}
              </td>
              <td class="col-actions">
                {#if editingId !== left.id && canManage(left)}
                  <button class="btn-sm btn-edit btn-icon" onclick={() => startEdit(left)} title="Edit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                  <form method="POST" action="?/delete" use:enhance={() => { return async ({ result, update }) => { if (result.type === 'success') invalidateOverridesCache(); await update({ reset: false }); }; }} style="display:inline">
                    <input type="hidden" name="id" value={left.id} />
                    <button type="submit" class="btn-sm btn-delete btn-icon" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
                  </form>
                {/if}
                {#if (checkStatuses[left.id] ?? 'idle') === 'checking'}
                  <span class="check-icon check-checking" title="Checking..."><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span>
                {:else if checkStatuses[left.id] === 'ok'}
                  <span class="check-icon check-ok" title="File reachable"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                {:else if checkStatuses[left.id] === 'not-found'}
                  <span class="check-icon check-not-found" title="404 Not Found"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>
                {:else if checkStatuses[left.id] === 'error'}
                  <span class="check-icon check-error" title="Request error"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                {/if}
              </td>
              <!-- Right item -->
              {#if right}
                <td class="cell-repo col-right">
                  <a href="https://huggingface.co/{right.hf_model_id}" target="_blank" rel="noopener">{right.hf_model_id}</a>
                </td>
                <td class="cell-path col-right" title={right.file_path}><code>{right.file_path}</code></td>
                <td class="cell-overrides col-right">
                  {#if editingId === right.id}
                    <form method="POST" action="?/update" use:enhance={() => {
                      return async ({ result, update }) => {
                        if (result.type === 'success') {
                          invalidateOverridesCache();
                          editingId = null;
                        }
                        await update({ reset: false });
                      };
                    }}>
                      <input type="hidden" name="id" value={right.id} />
                      <input type="text" name="overrides" class="edit-input" bind:value={editValue} placeholder="batch_size: 1, height: 224, width: 224" />
                      <div class="edit-actions">
                        <button type="submit" class="btn-sm btn-save">Save</button>
                        <button type="button" class="btn-sm btn-cancel" onclick={cancelEdit}>Cancel</button>
                      </div>
                    </form>
                  {:else}
                    <code class="overrides-display">{formatOverrides(right.overrides)}</code>
                  {/if}
                </td>
                <td class="col-updated col-right">
                  {#if right.updated_by_name}
                    <span class="updated-user" title="{right.updated_by_name} · {new Date(right.updated_at).toLocaleDateString()}">
                      {#if right.updated_by_avatar}
                        <img class="user-avatar" src={right.updated_by_avatar} alt="" crossorigin="anonymous" />
                      {:else}
                        <span class="user-avatar user-avatar-placeholder">{right.updated_by_name[0]?.toUpperCase()}</span>
                      {/if}
                      <span class="user-name">{right.updated_by_name}</span>
                    </span>
                  {/if}
                </td>
                <td class="col-actions col-right">
                  {#if editingId !== right.id && canManage(right)}
                    <button class="btn-sm btn-edit btn-icon" onclick={() => startEdit(right)} title="Edit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    <form method="POST" action="?/delete" use:enhance={() => { return async ({ result, update }) => { if (result.type === 'success') invalidateOverridesCache(); await update({ reset: false }); }; }} style="display:inline">
                      <input type="hidden" name="id" value={right.id} />
                      <button type="submit" class="btn-sm btn-delete btn-icon" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
                    </form>
                  {/if}
                  {#if (checkStatuses[right.id] ?? 'idle') === 'checking'}
                    <span class="check-icon check-checking" title="Checking..."><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span>
                  {:else if checkStatuses[right.id] === 'ok'}
                    <span class="check-icon check-ok" title="File reachable"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                  {:else if checkStatuses[right.id] === 'not-found'}
                    <span class="check-icon check-not-found" title="404 Not Found"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></span>
                  {:else if checkStatuses[right.id] === 'error'}
                    <span class="check-icon check-error" title="Request error"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                  {/if}
                </td>
              {:else}
                <td class="col-right"></td>
                <td class="col-right"></td>
                <td class="col-right"></td>
                <td class="col-right"></td>
                <td class="col-right"></td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .page {
    max-width: 100%;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .page-header-text h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .page-header-text p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 2px 0 0;
  }

  .page-header-text code {
    font-size: var(--text-xs);
    background: var(--color-surface-sunken);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  .page-header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-base);
    text-decoration: none;
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border: 1px solid var(--color-primary);
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
  }

  .btn-secondary {
    background: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
    background: var(--color-danger-light, #fef2f2);
    color: var(--color-danger, #dc2626);
    margin-bottom: var(--space-3);
    font-size: var(--text-sm);
  }

  .table-wrap {
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    table-layout: fixed;
  }

  /* 10 columns: Model, Path, Overrides, By, Actions | repeat */
  .data-table th:nth-child(1),
  .data-table th:nth-child(6) { width: 150px; }

  .data-table th:nth-child(2),
  .data-table th:nth-child(7) { width: 150px; }

  .data-table th:nth-child(3),
  .data-table th:nth-child(8) { width: 150px; }

  .data-table th:nth-child(4),
  .data-table th:nth-child(9) { width: 36px; }

  .data-table th:nth-child(5),
  .data-table th:nth-child(10) { width: 64px; }


  .data-table th,
  .data-table td {
    padding: 3px 12px 0px 12px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .data-table th {
    font-weight: 600;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .cell-repo {
    max-width: 180px;
  }

  .cell-repo a {
    color: var(--color-primary);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-repo a:hover {
    text-decoration: underline;
  }

  .cell-path {
    max-width: 160px;
  }

  .cell-path code {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-overrides {
    max-width: 220px;
  }

  .overrides-display {
    font-size: var(--text-xs);
    color: var(--color-text-primary);
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  code {
    font-family: var(--font-mono);
  }

  .edit-input {
    width: 100%;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
  }

  .edit-input:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .edit-actions {
    display: flex;
    gap: var(--space-1);
    margin-top: 4px;
  }

  .col-actions {
    white-space: nowrap;
  }

  .btn-icon {
    padding: 3px 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none !important;
    background: none;
  }

  .btn-sm {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 500;
    padding: 3px 3px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-sm:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-save {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-delete:hover {
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
  }

  .btn-cancel {
    color: var(--color-text-muted);
  }

  .empty {
    text-align: center;
    padding: var(--space-6) var(--space-4);
    color: var(--color-text-muted);
  }

  .empty-hint {
    font-size: var(--text-sm);
    margin-top: var(--space-1);
  }

  .col-updated {
    width: 140px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .updated-user {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .user-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .user-avatar-placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 600;
  }

  .user-name {
    display: none;
  }


  .search-input {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 5px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    width: 200px;
    transition: border-color var(--transition-base);
  }

  .search-input:focus-visible {
    border-color: var(--color-focus-ring);
    outline: none;
  }

  .btn-sync {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-sync:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-sync:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-check:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-check:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .check-icon {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: 3px;
  }

  .check-checking { color: var(--color-text-muted); }
  .check-ok { color: var(--color-success); }
  .check-not-found { color: var(--color-error); }
  .check-error { color: var(--color-warning, #f59e0b); }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  .data-table th:nth-child(6),
  .data-table td:nth-child(6) {
    border-left: 2px solid var(--color-border);
  }

  @media (max-width: 1200px) {
    .col-right {
      display: none;
    }
  }

  @media (max-width: 768px) {
    /* Header stacks, buttons wrap */
    .page-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .page-header-actions {
      flex-wrap: wrap;
      gap: var(--space-1);
      width: 100%;
    }

    .search-input {
      flex: 1 1 100%;
      width: 100%;
      box-sizing: border-box;
      order: -1;
    }

    .page-header-text p {
      max-width: 100%;
    }

    /* Table → flex card rows */
    .data-table thead {
      display: none;
    }

    .data-table tbody tr {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--color-border);
    }

    .data-table td {
      border: none;
      padding: 1px 0;
    }

    /* Full-width stacked fields */
    .cell-repo,
    .cell-path,
    .cell-overrides {
      flex: 0 0 100%;
      max-width: 100%;
      padding-bottom: 2px;
    }

    .cell-repo a,
    .cell-path code {
      max-width: 100%;
    }

    /* Overrides can wrap on small screens */
    .overrides-display {
      white-space: normal;
      overflow: visible;
      text-overflow: unset;
    }

    /* Meta row: updated-by + status + actions on one line */
    .col-updated {
      flex: 1 1 auto;
      min-width: 0;
      width: auto;
      padding-top: 6px;
    }


    .col-actions {
      flex: 0 0 auto;
      width: auto;
      padding-top: 6px;
    }

    .col-right {
      display: none;
    }

    /* Remove the 7th-column divider — irrelevant on mobile */
    .data-table td:nth-child(7) {
      border-left: none;
    }
  }
</style>
