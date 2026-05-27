<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props<{ data: { orgs: any[] }; form: any }>();

  let adding = $state(false);
  let newName = $state('');

  let editingId = $state<string | null>(null);
  let editName = $state('');

  function startEdit(org: any) {
    editingId = org.id;
    editName = org.name;
  }

  function cancelEdit() {
    editingId = null;
  }
</script>

<div class="admin-page">
  <header class="page-header">
    <div class="header-row">
      <div>
        <h1>Org Management</h1>
        <p>HuggingFace orgs to sync models from. Changes take effect on the next sync.</p>
      </div>
      <button class="btn-primary" onclick={() => { adding = !adding; newName = ''; }}>
        {adding ? 'Cancel' : '+ Add Org'}
      </button>
    </div>
  </header>

  {#if form?.error}
    <div class="error-banner"><p>{form.error}</p></div>
  {/if}

  {#if adding}
    <form method="POST" action="?/add" use:enhance={() => {
      return ({ result, update }) => {
        if (result.type === 'success') { adding = false; newName = ''; }
        update();
      };
    }} class="add-form">
      <input
        type="text"
        name="name"
        class="input"
        placeholder="HuggingFace org name (e.g. Xenova)"
        bind:value={newName}
        required
      />
      <button type="submit" class="btn-primary" disabled={!newName.trim()}>Add</button>
    </form>
  {/if}

  <div class="orgs-grid">
    {#each data.orgs as org (org.id)}
      <div class="org-card" class:editing={editingId === org.id}>
        {#if editingId === org.id}
          <input class="input input-inline" bind:value={editName} />
          <div class="card-actions">
            <form method="POST" action="?/update" use:enhance={() => {
              return ({ result, update }) => {
                if (result.type === 'success') cancelEdit();
                update();
              };
            }}>
              <input type="hidden" name="id" value={org.id} />
              <input type="hidden" name="name" value={editName} />
              <button type="submit" class="btn-edit" disabled={!editName.trim()}>Save</button>
            </form>
            <button class="btn-cancel" onclick={cancelEdit}>Cancel</button>
          </div>
        {:else}
          <span class="org-name">{org.name}</span>
          <div class="card-actions">
            <button class="btn-edit" onclick={() => startEdit(org)}>Edit</button>
            <form method="POST" action="?/remove" use:enhance>
              <input type="hidden" name="id" value={org.id} />
              <button
                type="submit"
                class="btn-remove"
                onclick={(e) => { if (!confirm(`Remove "${org.name}"? This won't delete existing synced models.`)) e.preventDefault(); }}
              >
                Remove
              </button>
            </form>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .admin-page { max-width: 100%; }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  
  .error-banner {
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-2);
  }

  .add-form {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }

  .input {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    transition: border-color var(--transition-base);
  }

  .input:focus-visible { border-color: var(--color-focus-ring); }
  .input[name="name"] { flex: 1; min-width: 200px; }

  .btn-primary {
    white-space: nowrap;
  }

  .orgs-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
  }

  .org-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    transition: border-color var(--transition-base);
  }

  .org-card:hover { border-color: var(--color-border-strong); }
  .org-card.editing { border-color: var(--color-primary); background: var(--color-accent-light); }

  .org-name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    word-break: break-all;
  }

  .card-actions {
    display: flex;
    gap: var(--space-half);
    align-items: center;
    flex-wrap: wrap;
  }

  @media (max-width: 1024px) {
    .orgs-grid { grid-template-columns: repeat(3, 1fr); }
  }

  @media (max-width: 640px) {
    .orgs-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 400px) {
    .orgs-grid { grid-template-columns: 1fr; }
  }

  .btn-edit {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: color var(--transition-base), border-color var(--transition-base);
  }

  .btn-edit:hover { color: var(--color-primary); border-color: var(--color-primary); }

  .btn-remove {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color var(--transition-base), border-color var(--transition-base);
  }

  .btn-remove:hover { color: var(--color-error); border-color: var(--color-error); }

  .btn-cancel {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }

  .input-inline {
    padding: 4px 8px;
    font-size: var(--text-sm);
    width: 100%;
  }

  @media (max-width: 640px) {
    .input[name="name"] {
      min-width: 0;
      width: 100%;
    }

    .add-form {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
