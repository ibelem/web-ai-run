<script lang="ts">
  import { inferFormat } from '$lib/huggingface/parser';

  let { data, form } = $props<{ data: { models: any[] }; form: any }>();

  const PAGE_SIZE = 50;
  let currentPage = $state(1);
  let searchQuery = $state('');
  let sortCol = $state<string>('task');
  let sortDir = $state<'asc' | 'desc'>('asc');

  type Col = { key: string; label: string };
  const COLUMNS: Col[] = [
    { key: 'task', label: 'Task' },
    { key: 'source_org', label: 'Org' },
    { key: 'hf_model_id', label: 'Repo' },
    { key: 'file_path', label: 'File' },
    { key: 'data_type', label: 'Type' },
    { key: 'format', label: 'Format' },
  ];

  function repoName(hf_model_id: string): string {
    const slash = hf_model_id.indexOf('/');
    return slash >= 0 ? hf_model_id.slice(slash + 1) : hf_model_id;
  }

  function sortValue(m: any, key: string): string | number {
    if (key === 'hf_model_id') return repoName(m.hf_model_id).toLowerCase();
    if (key === 'format') return inferFormat(m.file_path);
    const v = m[key];
    return typeof v === 'string' ? v.toLowerCase() : (v ?? '');
  }

  function toggleSort(key: string) {
    if (sortCol === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = key;
      sortDir = 'asc';
    }
    currentPage = 1;
  }

  const filteredModels = $derived(
    searchQuery
      ? data.models.filter(
          (m) =>
            m.hf_model_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.file_path.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : data.models
  );

  const sortedModels = $derived(
    [...filteredModels].sort((a, b) => {
      const av = sortValue(a, sortCol);
      const bv = sortValue(b, sortCol);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    })
  );

  const totalPages = $derived(Math.ceil(sortedModels.length / PAGE_SIZE));
  const pagedModels = $derived(
    sortedModels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  );

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
        <p>{data.models.length} models</p>
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
          {#each COLUMNS as col}
            <th>
              <button class="sort-btn" onclick={() => toggleSort(col.key)}>
                {col.label}
                <span class="sort-icon">
                  {#if sortCol === col.key}
                    {sortDir === 'asc' ? '↑' : '↓'}
                  {:else}
                    <span class="sort-idle">↕</span>
                  {/if}
                </span>
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each pagedModels as model (model.id)}
          <tr>
            <td>{model.task}</td>
            <td>{model.source_org}</td>
            <td class="mono repo-name">{repoName(model.hf_model_id)}</td>
            <td class="mono file-path">{model.file_path}</td>
            <td><span class="badge">{model.data_type}</span></td>
            <td><span class="badge">{inferFormat(model.file_path)}</span></td>
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

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .error-banner {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-lg);
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
    transition: border-color var(--transition-base);
  }

  .search-input:focus-visible {
    border-color: var(--color-focus-ring);
  }

  .result-count {
    font-size: var(--text-xs);
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
    padding: 0;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-sunken);
    white-space: nowrap;
  }

  .sort-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 10px var(--space-2);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: none;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    text-align: left;
    transition: color var(--transition-base);
  }

  .sort-btn:hover {
    color: var(--color-text-primary);
  }

  .sort-icon {
    font-size: 10px;
    line-height: 1;
  }

  .sort-idle {
    opacity: 0.3;
  }

  .repo-name {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .models-table td {
    padding: 2px var(--space-2);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .models-table tr:last-child td {
    border-bottom: none;
  }

  .models-table tr:hover td {
    background:var(--color-accent-light);
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
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
    background:var(--color-accent-light);
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

  @media (max-width: 640px) {
    .models-table {
      font-size: var(--text-xs);
    }

    .models-table td {
      padding: 6px var(--space-1);
    }

    .sort-btn {
      padding: 8px var(--space-1);
    }

    .repo-name {
      max-width: 120px;
    }

    .file-path {
      max-width: 100px;
    }
  }
</style>
