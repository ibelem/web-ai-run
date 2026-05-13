<script lang="ts">
  interface Props {
    runtimes: string[];
    orgs: string[];
    dataTypes: string[];
    categories: string[];
    selectedRuntime: string;
    selectedOrg: string;
    selectedDataType: string;
    selectedCategory: string;
    searchQuery: string;
    onfilter: (filters: {
      runtime: string;
      org: string;
      dataType: string;
      category: string;
      search: string;
    }) => void;
  }

  let {
    runtimes,
    orgs,
    dataTypes,
    categories,
    selectedRuntime = $bindable(''),
    selectedOrg = $bindable(''),
    selectedDataType = $bindable(''),
    selectedCategory = $bindable(''),
    searchQuery = $bindable(''),
    onfilter,
  }: Props = $props();

  function emit() {
    onfilter({
      runtime: selectedRuntime,
      org: selectedOrg,
      dataType: selectedDataType,
      category: selectedCategory,
      search: searchQuery,
    });
  }
</script>

<div class="filters">
  <input
    type="search"
    class="filter-search"
    placeholder="Search models..."
    bind:value={searchQuery}
    oninput={emit}
  />

  <select class="filter-select" bind:value={selectedRuntime} onchange={emit}>
    <option value="">All runtimes</option>
    {#each runtimes as rt}
      <option value={rt}>{rt}</option>
    {/each}
  </select>

  <select class="filter-select" bind:value={selectedOrg} onchange={emit}>
    <option value="">All orgs</option>
    {#each orgs as org}
      <option value={org}>{org}</option>
    {/each}
  </select>

  <select class="filter-select" bind:value={selectedDataType} onchange={emit}>
    <option value="">All data types</option>
    {#each dataTypes as dt}
      <option value={dt}>{dt}</option>
    {/each}
  </select>

  <select class="filter-select" bind:value={selectedCategory} onchange={emit}>
    <option value="">All categories</option>
    {#each categories as cat}
      <option value={cat}>{cat}</option>
    {/each}
  </select>
</div>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .filter-search {
    flex: 1 1 200px;
    min-width: 200px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color var(--transition-base);
  }

  .filter-search:focus {
    border-color: var(--color-focus-ring);
  }

  .filter-select {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    outline: none;
  }

  .filter-select:focus {
    border-color: var(--color-focus-ring);
  }
</style>
