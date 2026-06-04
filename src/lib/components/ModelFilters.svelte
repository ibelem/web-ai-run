<script lang="ts">
  import FormatIcon from './FormatIcon.svelte';

  interface Props {
    formats: string[];
    orgs: string[];
    dataTypes: string[];
    categories: string[];
    selectedFormats: Set<string>;
    selectedOrgs: Set<string>;
    selectedDataTypes: Set<string>;
    selectedCategories: Set<string>;
    selectedSizes: Set<string>;
    refreshing?: boolean;
    onfilter: (filters: {
      formats: Set<string>;
      orgs: Set<string>;
      dataTypes: Set<string>;
      categories: Set<string>;
      sizes: Set<string>;
    }) => void;
    onrefresh?: () => void;
  }

  let {
    formats,
    orgs,
    dataTypes,
    categories,
    selectedFormats = $bindable(new Set()),
    selectedOrgs = $bindable(new Set()),
    selectedDataTypes = $bindable(new Set()),
    selectedCategories = $bindable(new Set()),
    selectedSizes = $bindable(new Set()),
    refreshing = false,
    onfilter,
    onrefresh,
  }: Props = $props();

  const SIZE_BUCKETS = [
    { label: '< 1M',   key: 'lt1m'  },
    { label: '1M',     key: '1m'    },
    { label: '5M',     key: '5m'    },
    { label: '10M',    key: '10m'   },
    { label: '20M',    key: '20m'   },
    { label: '50M',    key: '50m'   },
    { label: '100M',   key: '100m'  },
    { label: '200M',   key: '200m'  },
    { label: '500M',   key: '500m'  },
    { label: '1GB',    key: '1gb'   },
    { label: '2GB',    key: '2gb'   },
    { label: '3GB',    key: '3gb'   },
    { label: '≥ 4GB',  key: 'gt4gb' },
  ];

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function emit() {
    onfilter({
      formats: selectedFormats,
      orgs: selectedOrgs,
      dataTypes: selectedDataTypes,
      categories: selectedCategories,
      sizes: selectedSizes,
    });
  }

  function toggleCategory(v: string) { selectedCategories = toggle(selectedCategories, v); emit(); }
  function toggleOrg(v: string)      { selectedOrgs = toggle(selectedOrgs, v); emit(); }
  function toggleFormat(v: string)   { selectedFormats = toggle(selectedFormats, v); emit(); }
  function toggleDataType(v: string) { selectedDataTypes = toggle(selectedDataTypes, v); emit(); }
  function toggleSize(v: string)     { selectedSizes = toggle(selectedSizes, v); emit(); }

  const hasFilters = $derived(
    selectedCategories.size > 0 ||
    selectedOrgs.size > 0 ||
    selectedFormats.size > 0 ||
    selectedDataTypes.size > 0 ||
    selectedSizes.size > 0
  );

  function clearAll() {
    selectedCategories = new Set();
    selectedOrgs = new Set();
    selectedFormats = new Set();
    selectedDataTypes = new Set();
    selectedSizes = new Set();
    emit();
  }

</script>

<aside class="sidebar">
  {#if hasFilters}
    <div class="sidebar-header">
      <span class="sidebar-title">Filters</span>
      <button class="clear-btn" onclick={clearAll}>Clear all</button>
    </div>
  {:else}
    <div class="sidebar-header">
      <span class="sidebar-title">Filters</span>
    </div>
  {/if}

  {#if formats.length > 0}
    <div class="filter-section">
      <span class="section-label">Format</span>
      <div class="tag-group">
        {#each formats as fmt}
          <button
            class="tag"
            class:selected={selectedFormats.has(fmt)}
            data-format={fmt}
            title={fmt}
            onclick={() => toggleFormat(fmt)}
          ><FormatIcon format={fmt} size={14} selected={selectedFormats.has(fmt)} /></button>
        {/each}
      </div>
    </div>
  {/if}

  {#if categories.length > 0}
    <div class="filter-section">
      <span class="section-label">Tasks</span>
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
    <div class="filter-section">
      <div class="section-label-row">
        <span class="section-label">Organization</span>
        {#if onrefresh}
          <button class="refresh-btn" onclick={onrefresh} disabled={refreshing} aria-label="Force refresh model library">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class:spinning={refreshing}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        {/if}
      </div>
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

  {#if dataTypes.length > 0}
    <div class="filter-section">
      <span class="section-label">Data Type</span>
      <div class="tag-group">
        {#each dataTypes as dt}
          <button
            class="tag"
            class:selected={selectedDataTypes.has(dt)}
            data-dtype={dt}
            onclick={() => toggleDataType(dt)}
          >{dt}</button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="filter-section">
    <span class="section-label">Size</span>
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
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-1);
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    letter-spacing: -0.01em;
  }

  .clear-btn {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    transition: color var(--transition-base);
  }

  .clear-btn:hover {
    color: var(--color-error);
  }

  .filter-section {
    padding: var(--space-2) 0;
  }

  .filter-section:last-child {
    border-bottom: none;
  }

  .section-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-label {
    display: block;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-1);
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .refresh-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-btn svg.spinning {
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .tag-group {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 1px 7px;
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
    background: var(--color-accent-light);
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .tag.selected {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    border-color: var(--color-primary);
  }

  .tag.selected:hover { opacity: 0.85; }

  /* dtype filter colors */
  .tag[data-dtype="fp32"]:not(.selected) { color: var(--color-dt-fp32); border-color: var(--color-dt-fp32); }
  .tag[data-dtype="fp16"]:not(.selected) { color: var(--color-dt-fp16); border-color: var(--color-dt-fp16); }
  .tag[data-dtype="bf16"]:not(.selected) { color: var(--color-dt-bf16); border-color: var(--color-dt-bf16); }
  .tag[data-dtype="fp8"]:not(.selected)  { color: var(--color-dt-fp8);  border-color: var(--color-dt-fp8); }
  .tag[data-dtype="int8"]:not(.selected) { color: var(--color-dt-int8); border-color: var(--color-dt-int8); }
  .tag[data-dtype="uint8"]:not(.selected){ color: var(--color-dt-uint8);border-color: var(--color-dt-uint8); }
  .tag[data-dtype="int4"]:not(.selected) { color: var(--color-dt-int4); border-color: var(--color-dt-int4); }
  .tag[data-dtype="uint4"]:not(.selected){ color: var(--color-dt-uint4);border-color: var(--color-dt-uint4); }
  .tag[data-dtype="q4"]:not(.selected)   { color: var(--color-dt-q4);   border-color: var(--color-dt-q4); }
  .tag[data-dtype="q4f16"]:not(.selected){ color: var(--color-dt-q4f16);border-color: var(--color-dt-q4f16); }
  .tag[data-dtype="bnb4"]:not(.selected) { color: var(--color-dt-bnb4); border-color: var(--color-dt-bnb4); }
  .tag[data-dtype="quantized"]:not(.selected){ color: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  .tag.selected[data-dtype="fp32"]      { background: var(--color-dt-fp32); border-color: var(--color-dt-fp32); }
  .tag.selected[data-dtype="fp16"]      { background: var(--color-dt-fp16); border-color: var(--color-dt-fp16); }
  .tag.selected[data-dtype="bf16"]      { background: var(--color-dt-bf16); border-color: var(--color-dt-bf16); }
  .tag.selected[data-dtype="fp8"]       { background: var(--color-dt-fp8);  border-color: var(--color-dt-fp8); }
  .tag.selected[data-dtype="int8"]      { background: var(--color-dt-int8); border-color: var(--color-dt-int8); }
  .tag.selected[data-dtype="uint8"]     { background: var(--color-dt-uint8);border-color: var(--color-dt-uint8); }
  .tag.selected[data-dtype="int4"]      { background: var(--color-dt-int4); border-color: var(--color-dt-int4); }
  .tag.selected[data-dtype="uint4"]     { background: var(--color-dt-uint4);border-color: var(--color-dt-uint4); }
  .tag.selected[data-dtype="q4"]        { background: var(--color-dt-q4);   border-color: var(--color-dt-q4); }
  .tag.selected[data-dtype="q4f16"]     { background: var(--color-dt-q4f16);border-color: var(--color-dt-q4f16); }
  .tag.selected[data-dtype="bnb4"]      { background: var(--color-dt-bnb4); border-color: var(--color-dt-bnb4); }
  .tag.selected[data-dtype="quantized"] { background: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  /* format filter colors */
  .tag[data-format="onnx"]:not(.selected)     { color: var(--color-fmt-onnx);     border-color: var(--color-fmt-onnx); }
  .tag[data-format="tflite"]:not(.selected)   { color: var(--color-fmt-tflite);   border-color: var(--color-fmt-tflite); }
  .tag[data-format="litertlm"]:not(.selected) { color: var(--color-fmt-litertlm); border-color: var(--color-fmt-litertlm); }
  .tag[data-format="task"]:not(.selected)     { color: var(--color-fmt-task);     border-color: var(--color-fmt-task); }

  .tag.selected[data-format="onnx"]     { background: var(--color-fmt-onnx);     border-color: var(--color-fmt-onnx); }
  .tag.selected[data-format="tflite"]   { background: var(--color-fmt-tflite);   border-color: var(--color-fmt-tflite); }
  .tag.selected[data-format="litertlm"] { background: var(--color-fmt-litertlm); border-color: var(--color-fmt-litertlm); }
  .tag.selected[data-format="task"]     { background: var(--color-fmt-task);     border-color: var(--color-fmt-task); }

  .tag.selected[data-format="tflite"] :global(.fmt-icon),
  .tag.selected[data-format="litertlm"] :global(.fmt-icon) {
    filter: brightness(0) invert(1);
  }
</style>
