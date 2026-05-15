<script lang="ts">
  interface Props {
    runtimes: string[];
    orgs: string[];
    dataTypes: string[];
    categories: string[];
    selectedRuntimes: Set<string>;
    selectedOrgs: Set<string>;
    selectedDataTypes: Set<string>;
    selectedCategories: Set<string>;
    selectedSizes: Set<string>;
    searchQuery: string;
    onfilter: (filters: {
      runtimes: Set<string>;
      orgs: Set<string>;
      dataTypes: Set<string>;
      categories: Set<string>;
      sizes: Set<string>;
      search: string;
    }) => void;
  }

  let {
    runtimes,
    orgs,
    dataTypes,
    categories,
    selectedRuntimes = $bindable(new Set()),
    selectedOrgs = $bindable(new Set()),
    selectedDataTypes = $bindable(new Set()),
    selectedCategories = $bindable(new Set()),
    selectedSizes = $bindable(new Set()),
    searchQuery = $bindable(''),
    onfilter,
  }: Props = $props();

  const SIZE_BUCKETS = [
    { label: '< 1M',   key: 'lt1m',   test: (b: number) => b < 1_000_000 },
    { label: '1M',     key: '1m',     test: (b: number) => b >= 1_000_000 && b < 5_000_000 },
    { label: '5M',     key: '5m',     test: (b: number) => b >= 5_000_000 && b < 10_000_000 },
    { label: '10M',    key: '10m',    test: (b: number) => b >= 10_000_000 && b < 20_000_000 },
    { label: '20M',    key: '20m',    test: (b: number) => b >= 20_000_000 && b < 50_000_000 },
    { label: '50M',    key: '50m',    test: (b: number) => b >= 50_000_000 && b < 100_000_000 },
    { label: '100M',   key: '100m',   test: (b: number) => b >= 100_000_000 && b < 200_000_000 },
    { label: '200M',   key: '200m',   test: (b: number) => b >= 200_000_000 && b < 500_000_000 },
    { label: '500M',   key: '500m',   test: (b: number) => b >= 500_000_000 && b < 1_000_000_000 },
    { label: '1GB',    key: '1gb',    test: (b: number) => b >= 1_000_000_000 && b < 2_000_000_000 },
    { label: '2GB',    key: '2gb',    test: (b: number) => b >= 2_000_000_000 && b < 3_000_000_000 },
    { label: '3GB',    key: '3gb',    test: (b: number) => b >= 3_000_000_000 && b < 4_000_000_000 },
    { label: '≥ 4GB',  key: 'gt4gb',  test: (b: number) => b >= 4_000_000_000 },
  ];

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function emit() {
    onfilter({
      runtimes: selectedRuntimes,
      orgs: selectedOrgs,
      dataTypes: selectedDataTypes,
      categories: selectedCategories,
      sizes: selectedSizes,
      search: searchQuery,
    });
  }

  function toggleCategory(v: string) { selectedCategories = toggle(selectedCategories, v); emit(); }
  function toggleOrg(v: string)      { selectedOrgs = toggle(selectedOrgs, v); emit(); }
  function toggleRuntime(v: string)  { selectedRuntimes = toggle(selectedRuntimes, v); emit(); }
  function toggleDataType(v: string) { selectedDataTypes = toggle(selectedDataTypes, v); emit(); }
  function toggleSize(v: string)     { selectedSizes = toggle(selectedSizes, v); emit(); }

  const hasFilters = $derived(
    selectedCategories.size > 0 ||
    selectedOrgs.size > 0 ||
    selectedRuntimes.size > 0 ||
    selectedDataTypes.size > 0 ||
    selectedSizes.size > 0 ||
    searchQuery.length > 0
  );

  function clearAll() {
    selectedCategories = new Set();
    selectedOrgs = new Set();
    selectedRuntimes = new Set();
    selectedDataTypes = new Set();
    selectedSizes = new Set();
    searchQuery = '';
    emit();
  }

  // Data type color mapping
  const dtColor: Record<string, string> = {
    fp32:  'var(--color-primary)',
    fp16:  '#8b5cf6',
    bf16:  '#7c3aed',
    fp8:   '#a855f7',
    int8:  '#06b6d4',
    uint8: '#0891b2',
    int4:  '#10b981',
    uint4: '#059669',
    q4:    '#16a34a',
    q4f16: '#6366f1',
    bnb4:  '#f59e0b',
  };

  function dtStyle(dt: string, selected: boolean): string {
    const color = dtColor[dt] ?? 'var(--color-primary)';
    if (selected) return `background:${color};color:#fff;border-color:${color}`;
    return `--tag-hover-color:${color};--tag-hover-bg:${color}1a;--tag-hover-border:${color}`;
  }
</script>

<div class="filters">

  {#if categories.length > 0}
    <div class="filter-row">
      <span class="filter-label">Category</span>
      <div class="tag-group">
        {#each categories as cat}
          <button
            class="tag"
            class:selected={selectedCategories.has(cat)}
            onclick={() => toggleCategory(cat)}
          >{cat}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if orgs.length > 0}
    <div class="filter-row">
      <span class="filter-label">Org</span>
      <div class="tag-group">
        {#each orgs as org}
          <button
            class="tag"
            class:selected={selectedOrgs.has(org)}
            onclick={() => toggleOrg(org)}
          >{org}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if runtimes.length > 0}
    <div class="filter-row">
      <span class="filter-label">Runtime</span>
      <div class="tag-group">
        {#each runtimes as rt}
          <button
            class="tag"
            class:selected={selectedRuntimes.has(rt)}
            onclick={() => toggleRuntime(rt)}
          >{rt}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if dataTypes.length > 0}
    <div class="filter-row">
      <span class="filter-label">Data Type</span>
      <div class="tag-group">
        {#each dataTypes as dt}
          <button
            class="tag"
            class:selected={selectedDataTypes.has(dt)}
            style={dtStyle(dt, selectedDataTypes.has(dt))}
            onclick={() => toggleDataType(dt)}
          >{dt}</button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="filter-row">
    <span class="filter-label">Size</span>
    <div class="tag-group">
      {#each SIZE_BUCKETS as bucket}
        <button
          class="tag"
          class:selected={selectedSizes.has(bucket.key)}
          onclick={() => toggleSize(bucket.key)}
        >{bucket.label}</button>
      {/each}
    </div>
  </div>

  <div class="search-row">
    <input
      type="search"
      class="search-input"
      placeholder="Search models..."
      bind:value={searchQuery}
      oninput={emit}
    />
    {#if hasFilters}
      <button class="clear-btn" onclick={clearAll}>Clear all</button>
    {/if}
  </div>

</div>

<style>
  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .filter-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 64px;
    padding-top: 5px;
    flex-shrink: 0;
  }

  .tag-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 10px;
    border-radius: var(--radius-base);
    border: 1px solid var(--color-border-strong);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 120ms, color 120ms, border-color 120ms;
    white-space: nowrap;
    line-height: 1.4;
  }

  .tag:hover:not(.selected) {
    background: var(--tag-hover-bg, var(--color-accent-light));
    color: var(--tag-hover-color, var(--color-primary));
    border-color: var(--tag-hover-border, var(--color-primary));
  }

  .tag.selected {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
  }

  .tag.selected:hover {
    opacity: 0.85;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-half);
  }

  .search-input {
    flex: 1;
    max-width: 360px;
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

  .clear-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-half) var(--space-1);
    border-radius: var(--radius-sm);
    transition: color var(--transition-base);
  }

  .clear-btn:hover {
    color: var(--color-error);
  }
</style>
