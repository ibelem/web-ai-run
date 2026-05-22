<script lang="ts">
  import { goto } from '$app/navigation';
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
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

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
    <div class="recipe-grid">
      {#each data.recipes as recipe (recipe.id)}
        <div class="recipe-card">
          <div class="recipe-header">
            <h2 class="recipe-name">{recipe.name}</h2>
            {#if data.userId === recipe.owner_id}
              <button
                class="visibility-toggle"
                class:is-public={recipe.visibility === 'public'}
                onclick={() => toggleVisibility(recipe)}
                title="Click to toggle visibility"
              >
                {recipe.visibility === 'public' ? 'public' : 'personal'}
              </button>
            {:else if recipe.visibility === 'public'}
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
    border-radius: 100px;
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

  .recipe-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-2);
  }

  .recipe-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    padding: var(--space-2);
    background: var(--color-surface-raised);
    display: flex;
    flex-direction: column;
    transition: border-color var(--transition-base), background var(--transition-base);
  }

  .recipe-card:hover {
    border-color: var(--color-primary);
    background: var(--color-accent-light);
  }

  .recipe-header {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-half);
  }

  .recipe-name {
    flex: 1;
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .visibility-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-dt-int8);
    background: none;
    color: var(--color-dt-int8);
    flex-shrink: 0;
    transition: background var(--transition-base), color var(--transition-base);
  }

  .recipe-card:hover .visibility-badge {
    background: var(--color-dt-int8);
    color: #fff;
  }

  .visibility-toggle {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-dt-fp16);
    background: none;
    color: var(--color-dt-fp16);
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
  }

  .recipe-card:hover .visibility-toggle {
    background: var(--color-dt-fp16);
    color: #fff;
  }

  .visibility-toggle.is-public {
    border-color: var(--color-dt-int8);
    color: var(--color-dt-int8);
  }

  .recipe-card:hover .visibility-toggle.is-public {
    background: var(--color-dt-int8);
    border-color: var(--color-dt-int8);
    color: #fff;
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
    flex: 1;
    align-content: flex-start;
    min-height: 52px;
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

  .recipe-actions > * {
    flex: 1;
    text-align: center;
  }

  .btn-run-sm {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 10px;
    border: none;
    border-radius: 100px;
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
    border-radius: 100px;
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
    border-radius: 100px;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .btn-delete-sm:hover { background: var(--color-nav-item-hover); }
</style>
