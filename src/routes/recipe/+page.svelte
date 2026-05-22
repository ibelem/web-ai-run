<script lang="ts">
  import { goto } from '$app/navigation';
  import { deleteRecipe } from '$lib/recipes/crud';
  import type { Recipe } from '$lib/recipes/crud';

  let { data } = $props();

  function runRecipe(recipe: Recipe) {
    const modelIds = recipe.models.map((m) => m.hf_model_id).join(',');
    goto(`/run?models=${modelIds}&recipe=${recipe.slug}`);
  }

  async function handleDelete(recipe: Recipe) {
    if (!confirm(`Delete "${recipe.name}"?`)) return;
    await deleteRecipe(recipe.id);
    data.recipes = data.recipes.filter((r) => r.id !== recipe.id);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<div class="recipe-page">
  <header class="page-header">
    <div class="header-row">
      <div>
        <h1>Recipes</h1>
        <p>Saved model+backend combinations for quick re-runs.</p>
      </div>
      <a href="/recipe/new" class="btn-primary">New Recipe</a>
    </div>
  </header>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load recipes: {data.error}</p>
    </div>
  {:else if data.recipes.length === 0}
    <div class="empty">
      <p>No recipes yet. Create one from the Model page or click "New Recipe" above.</p>
    </div>
  {:else}
    <div class="recipe-grid">
      {#each data.recipes as recipe (recipe.id)}
        <div class="recipe-card">
          <div class="recipe-header">
            <h2 class="recipe-name">{recipe.name}</h2>
            {#if recipe.visibility === 'public'}
              <span class="visibility-badge">public</span>
            {/if}
          </div>
          <p class="recipe-meta">
            {recipe.models.length} model{recipe.models.length !== 1 ? 's' : ''}
            &middot; {formatDate(recipe.updated_at)}
          </p>
          <div class="recipe-models">
            {#each recipe.models.slice(0, 3) as model}
              <span class="model-tag">{model.hf_model_id.split('/').pop()}</span>
            {/each}
            {#if recipe.models.length > 3}
              <span class="model-tag model-tag-more">+{recipe.models.length - 3}</span>
            {/if}
          </div>
          <div class="recipe-actions">
            <button class="btn-run-sm" onclick={() => runRecipe(recipe)}>Run</button>
            {#if data.userId === recipe.owner_id}
              <a href="/recipe/{recipe.slug}/edit" class="btn-edit-sm">Edit</a>
              <button class="btn-delete-sm" onclick={() => handleDelete(recipe)}>Delete</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>


<style>
  .recipe-page {
    max-width: 100%;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  
  .btn-primary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: #fff;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    transition: background var(--transition-base);
  }

  .btn-primary:hover { background: var(--color-primary-hover); }

  .error-banner {
    padding: var(--space-2);
    border-radius: var(--radius-base);
  }

  .empty .btn-secondary {
    margin-top: var(--space-2);
  }

  .recipe-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-2);
  }

  .recipe-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
    background: var(--color-surface-raised);
    transition: border-color var(--transition-base);
  }

  .recipe-card:hover {
    border-color: var(--color-border-strong);
  }

  .recipe-header {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-half);
  }

  .recipe-name {
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .visibility-badge {
    font-size: var(--text-xs);
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }

  .recipe-meta {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }

  .recipe-models {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
    margin-bottom: var(--space-2);
  }

  .model-tag {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
  }

  .model-tag-more {
    color: var(--color-text-muted);
  }

  .recipe-actions {
    display: flex;
    gap: var(--space-1);
  }

  .btn-run-sm {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--color-primary);
    color: #fff;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-run-sm:hover { background: var(--color-primary-hover); }

  .btn-edit-sm {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: none;
  }

  .btn-edit-sm:hover { background: var(--color-nav-item-hover); }

  .btn-delete-sm {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-error);
    cursor: pointer;
  }

  .btn-delete-sm:hover { background: var(--color-nav-item-hover); }

  .btn-secondary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .btn-secondary:hover { background: var(--color-nav-item-hover); }


  .dialog-panel h2 {
    font-size: var(--text-lg);
    font-weight: 300;
    margin-bottom: var(--space-1);
  }

  .dialog-body {
    margin-bottom: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .dialog-actions {
    flex-direction: column;
  }
</style>
