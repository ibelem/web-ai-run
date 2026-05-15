<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props<{ data: { models: any[] }; form: any }>();

  const PAGE_SIZE = 50;
  let currentPage = $state(1);
  let searchQuery = $state('');

  const filteredModels = $derived(
    searchQuery
      ? data.models.filter(
          (m) =>
            m.hf_model_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.file_path.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : data.models
  );

  const totalPages = $derived(Math.ceil(filteredModels.length / PAGE_SIZE));
  const pagedModels = $derived(
    filteredModels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  );

  const enabledCount = $derived(data.models.filter((m) => m.enabled).length);

  function goTo(page: number) {
    if (page >= 1 && page <= totalPages) currentPage = page;
  }

  $effect(() => {
    searchQuery;
    currentPage = 1;
  });
</script>

<div class="admin-page">
  <header class="page-header">
    <div class="header-row">
      <div>
        <h1>Model Management</h1>
        <p>{enabledCount} of {data.models.length} models enabled</p>
      </div>
    </div>
  </header>

  {#if form?.error}
    <div class="error-banner"><p>{form.error}</p></div>
  {/if}

  <div class="toolbar">
    <input
      type="search"
      class="search-input"
      placeholder="Search models..."
      bind:value={searchQuery}
    />
    <span class="result-count">{filteredModels.length} results</span>
  </div>

  <div class="table-wrapper">
    <table class="models-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>File</th>
          <th>Runtime</th>
          <th>Type</th>
          <th>Org</th>
          <th>Category</th>
          <th>Enabled</th>
        </tr>
      </thead>
      <tbody>
        {#each pagedModels as model (model.id)}
          <tr class={model.enabled ? '' : 'disabled-row'}>
            <td class="mono model-id">{model.hf_model_id}</td>
            <td class="mono file-path">{model.file_path}</td>
            <td><span class="badge">{model.runtime}</span></td>
            <td><span class="badge">{model.data_type}</span></td>
            <td>{model.source_org}</td>
            <td>{model.category}</td>
            <td>
              <form method="POST" action="?/toggleEnabled" use:enhance>
                <input type="hidden" name="id" value={model.id} />
                <input type="hidden" name="enabled" value={model.enabled ? 'false' : 'true'} />
                <button
                  type="submit"
                  class="toggle-btn {model.enabled ? 'toggle-on' : 'toggle-off'}"
                  title={model.enabled ? 'Click to disable' : 'Click to enable'}
                >
                  {model.enabled ? 'On' : 'Off'}
                </button>
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if totalPages > 1}
    <nav class="pagination">
      <button class="page-btn" disabled={currentPage === 1} onclick={() => goTo(1)}>
        «
      </button>
      <button class="page-btn" disabled={currentPage === 1} onclick={() => goTo(currentPage - 1)}>
        Previous
      </button>
      <span class="page-info">Page {currentPage} of {totalPages} ({filteredModels.length} models)</span>
      <button class="page-btn" disabled={currentPage === totalPages} onclick={() => goTo(currentPage + 1)}>
        Next
      </button>
      <button class="page-btn" disabled={currentPage === totalPages} onclick={() => goTo(totalPages)}>
        »
      </button>
    </nav>
  {/if}
</div>

<style>
  .admin-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .page-header h1 {
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
  }

  .error-banner {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-lg);
    background: var(--color-surface-sunken);
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .search-input {
    flex: 1;
    max-width: 400px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color var(--transition-base);
  }

  .search-input:focus {
    border-color: var(--color-focus-ring);
  }

  .result-count {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .models-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .models-table th {
    text-align: left;
    padding: 10px var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-sunken);
    white-space: nowrap;
  }

  .models-table td {
    padding: 8px var(--space-2);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .models-table tr:last-child td {
    border-bottom: none;
  }

  .models-table tr:hover td {
    background: var(--color-accent-light);
  }

  .disabled-row td {
    opacity: 0.45;
  }

  .disabled-row:hover td {
    opacity: 0.65;
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .model-id {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-path {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    white-space: nowrap;
  }

  .toggle-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 600;
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    border: none;
    cursor: pointer;
    transition: opacity var(--transition-base);
  }

  .toggle-on {
    background: var(--color-primary);
    color: #ffffff;
  }

  .toggle-off {
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
  }

  .toggle-btn:hover {
    opacity: 0.8;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    margin-top: var(--space-3);
  }

  .page-btn {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 6px 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    padding: 0 var(--space-1);
  }
</style>
