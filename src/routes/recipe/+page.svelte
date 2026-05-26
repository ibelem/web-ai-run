<script lang="ts">
  import { deleteRecipe, updateRecipe } from '$lib/recipes/crud';
  import type { Recipe } from '$lib/recipes/crud';

  let { data } = $props();

  function runRecipe(recipe: Recipe) {
    try {
      sessionStorage.setItem('hf_ext_models', JSON.stringify(
        recipe.models.map((m) => ({
          hf_model_id: m.hf_model_id,
          file_path: m.file_path,
          data_type: m.data_type,
          runtime: (m.file_path.endsWith('.tflite') || m.file_path.endsWith('.litertlm')) ? 'litert' : 'onnx',
        }))
      ));
    } catch {}
    window.location.href = '/run';
  }

  async function handleDelete(recipe: Recipe) {
    if (!confirm(`Delete "${recipe.name}"?`)) return;
    await deleteRecipe(recipe.id);
    data.recipes = data.recipes.filter((r) => r.id !== recipe.id);
  }

  async function toggleVisibility(recipe: Recipe) {
    const next = recipe.visibility === 'public' ? 'personal' : 'public';
    await updateRecipe(recipe.id, { visibility: next });
    data.recipes = data.recipes.map((r) =>
      r.id === recipe.id ? { ...r, visibility: next } : r
    );
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  let copyFeedback = $state<string | null>(null);

  async function copyShareLink(recipe: Recipe) {
    const url = `${window.location.origin}/recipe/${recipe.slug}`;
    await navigator.clipboard.writeText(url);
    copyFeedback = recipe.id;
    setTimeout(() => { copyFeedback = null; }, 2000);
  }

  const publicRecipes = $derived(data.recipes.filter(r => r.visibility === 'public'));
  const personalRecipes = $derived(data.recipes.filter(r => r.visibility === 'personal'));

  function splitTwo(recipes: Recipe[]): [Recipe[], Recipe[]] {
    return [recipes.filter((_, i) => i % 2 === 0), recipes.filter((_, i) => i % 2 === 1)];
  }
</script>

{#snippet recipeRow(recipe: any, visLabel: string, showOwner = false)}
  <tr class="recipe-row">
    <td class="cell-name">
      <a href="/recipe/{recipe.slug}" class="name-link" title={recipe.name}>{recipe.name}</a>
      <div class="model-popup">
        {#each recipe.models as m}
          <div class="popup-row">
            <span class="popup-repo">{m.hf_model_id}</span>
            <span class="popup-file">{m.file_path}</span>
            <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
          </div>
        {/each}
      </div>
    </td>
    {#if showOwner}
      <td class="cell-owner">
        {#if recipe.owner_avatar_url}
          <img src={recipe.owner_avatar_url} alt="" class="owner-avatar" crossorigin="anonymous" />
        {:else}
          <span class="owner-avatar owner-avatar-placeholder">{(recipe.owner_display_name ?? '?')[0].toUpperCase()}</span>
        {/if}
        <span class="owner-name">{recipe.owner_display_name ?? 'Unknown'}</span>
      </td>
    {/if}
    <td class="cell-date">{formatDate(recipe.updated_at)}</td>
    <td class="cell-actions">
      <span class="cell-actions-inner">
        <button class="action-btn action-run" onclick={() => runRecipe(recipe)}>Run</button>
        <button class="action-btn action-share" onclick={() => copyShareLink(recipe)}>
          {copyFeedback === recipe.id ? '✓' : 'Link'}
        </button>
        {#if data.userId === recipe.owner_id}
          <button class="action-btn action-vis" onclick={() => toggleVisibility(recipe)}>{visLabel}</button>
          <a href="/recipe/{recipe.slug}/edit" class="action-btn action-edit">Edit</a>
          <button class="action-btn action-delete" onclick={() => handleDelete(recipe)}>Del</button>
        {/if}
      </span>
    </td>
  </tr>
{/snippet}

{#snippet recipeTable(col: any[], visLabel: string, showOwner = false)}
  {#if col.length > 0}
    <div class="table-wrapper">
      <table class="recipe-table">
        <thead>
          <tr>
            <th class="col-name">Name</th>
            {#if showOwner}<th class="col-owner">User</th>{/if}
            <th class="col-date">Updated</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {#each col as recipe (recipe.id)}
            {@render recipeRow(recipe, visLabel, showOwner)}
          {/each}
        </tbody>
      </table>
    </div>
    <!-- Mobile cards -->
    <div class="mobile-cards">
      {#each col as recipe (recipe.id)}
        <div class="mobile-card">
          <div class="mobile-card-top">
            <a href="/recipe/{recipe.slug}" class="mobile-card-name">{recipe.name}</a>
            <span class="mobile-card-date">{formatDate(recipe.updated_at)}</span>
          </div>
          {#if showOwner}
            <div class="mobile-card-owner">
              {#if recipe.owner_avatar_url}
                <img src={recipe.owner_avatar_url} alt="" class="owner-avatar" crossorigin="anonymous" />
              {:else}
                <span class="owner-avatar owner-avatar-placeholder">{(recipe.owner_display_name ?? '?')[0].toUpperCase()}</span>
              {/if}
              <span class="owner-name">{recipe.owner_display_name ?? 'Unknown'}</span>
            </div>
          {/if}
          <div class="mobile-card-models">
            {#each recipe.models as m}
              <div class="mobile-model-row">
                <span class="mobile-model-id">{m.hf_model_id}</span>
                <span class="dtype-chip" data-dtype={m.data_type}>{m.data_type}</span>
              </div>
            {/each}
          </div>
          <div class="mobile-card-actions">
            <button class="action-btn action-run" onclick={() => runRecipe(recipe)}>Run</button>
            <button class="action-btn action-share" onclick={() => copyShareLink(recipe)}>
              {copyFeedback === recipe.id ? '✓' : 'Link'}
            </button>
            {#if data.userId === recipe.owner_id}
              <button class="action-btn action-vis" onclick={() => toggleVisibility(recipe)}>{visLabel}</button>
              <a href="/recipe/{recipe.slug}/edit" class="action-btn action-edit">Edit</a>
              <button class="action-btn action-delete" onclick={() => handleDelete(recipe)}>Del</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

<div class="recipe-page">
  <header class="page-header">
    <div class="page-header-text">
      <h1>Recipes</h1>
      <p>Saved model combinations for quick re-runs.</p>
    </div>
    <a href="/recipe/new" class="btn-new-recipe">New Recipe</a>
  </header>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load recipes: {data.error}</p>
    </div>
  {:else if data.recipes.length === 0}
    <div class="empty">
      <p>No recipes yet. Browse models and save them as a recipe from the Cart panel.</p>
    </div>
  {:else}

    {#if publicRecipes.length > 0}
      {@const [left, right] = splitTwo(publicRecipes)}
      <section class="recipe-section">
        <div class="section-header">
          <h2 class="section-title section-public">Public</h2>
          <span class="count-badge">{publicRecipes.length}</span>
        </div>
        <div class="two-col">
          {@render recipeTable(left, '→ Personal', true)}
          {@render recipeTable(right, '→ Personal', true)}
        </div>
      </section>
    {/if}

    {#if personalRecipes.length > 0}
      {@const [left, right] = splitTwo(personalRecipes)}
      <section class="recipe-section">
        <div class="section-header">
          <h2 class="section-title section-personal">Personal</h2>
          <span class="count-badge">{personalRecipes.length}</span>
        </div>
        <div class="two-col">
          {@render recipeTable(left, '→ Public')}
          {@render recipeTable(right, '→ Public')}
        </div>
      </section>
    {/if}

  {/if}
</div>


<style>
  .recipe-page {
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

  .btn-new-recipe {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: 500;
    padding: 10px 20px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-primary);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background var(--transition-base);
  }

  .btn-new-recipe:hover {
    background: var(--color-accent-light);
  }

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
  }

  .empty p {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .recipe-section {
    margin-bottom: var(--space-4);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
    padding-bottom: var(--space-1);
  }

  .section-title {
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0;
  }

  .section-public  { color: var(--color-dt-int8); }
  .section-personal { color: var(--color-dt-fp16); }

  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-mono);
    letter-spacing: 0;
    text-transform: none;
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }

  .table-wrapper {
    overflow: visible;
  }

  .recipe-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    table-layout: fixed;
  }

  .recipe-table th {
    text-align: left;
    padding: var(--space-1);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border-strong);
    white-space: nowrap;
  }

  .recipe-table td {
    padding: var(--space-1);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
    white-space: nowrap;
    overflow: hidden;
  }

  .two-col > :first-child .recipe-row td:last-child {
    border-right: 1px solid var(--color-border);
  }

  /* Name fills remaining space; others are fixed */
  .col-name    { width: auto; }
  .col-owner   { width: 120px; }
  .col-date    { width: 90px; }
  .col-actions { width: 290px; }

  /* Name cell — relative so popup anchors to it */
  .cell-name {
    position: relative;
    overflow: visible !important;
  }

  .name-link {
    display: block;
    font-weight: 500;
    color: var(--color-text-primary);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color var(--transition-base);
  }

  .name-link:hover {
    color: var(--color-primary);
  }

  /* Hover popup */
  .model-popup {
    display: none;
    position: absolute;
    top: calc(100% + 0px);
    left: 0;
    z-index: var(--z-dropdown);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    box-shadow: var(--shadow-dropdown);
    padding: var(--space-1) var(--space-2);
    width: calc(100% + 120px + 90px + 290px);
    pointer-events: none;
  }

  .recipe-row:hover .model-popup {
    display: block;
  }

  .popup-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 3px 0;
    border-bottom: 1px solid var(--color-border);
  }

  .popup-row:last-child {
    border-bottom: none;
  }

  .popup-repo {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 300px;
    flex-shrink: 0;
  }

  .popup-file {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .dtype-chip {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid;
    line-height: 1.4;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
    margin-right: 2px;
  }

  .dtype-chip[data-dtype="fp32"]      { color: var(--color-dt-fp32);      border-color: var(--color-dt-fp32); }
  .dtype-chip[data-dtype="fp16"]      { color: var(--color-dt-fp16);      border-color: var(--color-dt-fp16); }
  .dtype-chip[data-dtype="bf16"]      { color: var(--color-dt-bf16);      border-color: var(--color-dt-bf16); }
  .dtype-chip[data-dtype="fp8"]       { color: var(--color-dt-fp8);       border-color: var(--color-dt-fp8); }
  .dtype-chip[data-dtype="int8"]      { color: var(--color-dt-int8);      border-color: var(--color-dt-int8); }
  .dtype-chip[data-dtype="uint8"]     { color: var(--color-dt-uint8);     border-color: var(--color-dt-uint8); }
  .dtype-chip[data-dtype="int4"]      { color: var(--color-dt-int4);      border-color: var(--color-dt-int4); }
  .dtype-chip[data-dtype="uint4"]     { color: var(--color-dt-uint4);     border-color: var(--color-dt-uint4); }
  .dtype-chip[data-dtype="q4"]        { color: var(--color-dt-q4);        border-color: var(--color-dt-q4); }
  .dtype-chip[data-dtype="q4f16"]     { color: var(--color-dt-q4f16);     border-color: var(--color-dt-q4f16); }
  .dtype-chip[data-dtype="bnb4"]      { color: var(--color-dt-bnb4);      border-color: var(--color-dt-bnb4); }
  .dtype-chip[data-dtype="quantized"] { color: var(--color-dt-quantized); border-color: var(--color-dt-quantized); }

  .cell-owner {
    vertical-align: middle;
  }

  .owner-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .owner-avatar-placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .cell-owner {
    display: table-cell;
  }

  .cell-owner > .owner-avatar,
  .cell-owner > .owner-name {
    display: inline;
    vertical-align: middle;
  }

  .owner-name {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-left: 5px;
  }

  .cell-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .cell-actions {
    vertical-align: middle;
    text-align: center;
  }

  .cell-actions-inner {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: middle;
    white-space: nowrap;
  }

  .action-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    line-height: 1.4;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    display: inline-block;
    vertical-align: middle;
    transition: color var(--transition-base), border-color var(--transition-base), background var(--transition-base);
  }

  .action-run    { width: 34px;  text-align: center; border-color: var(--color-primary); color: var(--color-primary); }
  .action-share  { width: 40px;  text-align: center; }
  .action-vis    { width: 96px;  text-align: center; }
  .action-edit   { width: 40px;  text-align: center; }
  .action-delete { width: 34px;  text-align: center; }

  .action-run:hover {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .action-share:hover,
  .action-edit:hover,
  .action-vis:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .action-delete:hover {
    border-color: var(--color-error);
    color: var(--color-error);
  }

  .recipe-table tbody tr:hover td {
    background: var(--color-surface-sunken);
  }

  .mobile-cards {
    display: none;
  }

  @media (max-width: 900px) {
    .two-col {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .btn-new-recipe {
      width: 100%;
      text-align: center;
    }

    .table-wrapper {
      display: none;
    }

    .mobile-cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .mobile-card {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-base);
      padding: var(--space-2);
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .mobile-card-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-1);
    }

    .mobile-card-name {
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-text-primary);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .mobile-card-name:hover {
      color: var(--color-primary);
    }

    .mobile-card-date {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .mobile-card-owner {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .mobile-card-models {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .mobile-model-row {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .mobile-model-id {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .mobile-card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding-top: var(--space-1);
      border-top: 1px solid var(--color-border);
    }
  }
</style>
