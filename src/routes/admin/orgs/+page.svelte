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
      <button class="btn-add" onclick={() => { adding = !adding; newName = ''; }}>
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

  <div class="table-wrapper">
    <table class="orgs-table">
      <thead>
        <tr>
          <th>Org Name</th>
          <th>Enabled</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each data.orgs as org (org.id)}
          {#if editingId === org.id}
            <tr class="editing-row">
              <td colspan="2">
                <input class="input input-inline" bind:value={editName} />
              </td>
              <td class="row-actions">
                <form method="POST" action="?/update" use:enhance={() => {
                  return ({ result, update }) => {
                    if (result.type === 'success') cancelEdit();
                    update();
                  };
                }}>
                  <input type="hidden" name="id" value={org.id} />
                  <input type="hidden" name="name" value={editName} />
                  <button type="submit" class="btn-primary" disabled={!editName.trim()}>Save</button>
                </form>
                <button class="btn-cancel" onclick={cancelEdit}>Cancel</button>
              </td>
            </tr>
          {:else}
            <tr class={org.enabled ? '' : 'disabled-row'}>
              <td class="mono">{org.name}</td>
              <td>
                <form method="POST" action="?/toggleEnabled" use:enhance>
                  <input type="hidden" name="id" value={org.id} />
                  <input type="hidden" name="enabled" value={org.enabled ? 'false' : 'true'} />
                  <button type="submit" class="toggle-btn {org.enabled ? 'toggle-on' : 'toggle-off'}">
                    {org.enabled ? 'On' : 'Off'}
                  </button>
                </form>
              </td>
              <td class="row-actions">
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
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
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
    outline: none;
    transition: border-color var(--transition-base);
  }

  .input:focus { border-color: var(--color-focus-ring); }
  .input[name="name"] { flex: 1; min-width: 200px; }

  .btn-add {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-primary);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--transition-base);
  }

  .btn-add:hover { background: var(--color-accent-light); }

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
    white-space: nowrap;
    transition: background var(--transition-base);
  }

  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { background: var(--color-primary-hover); }

  .table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .orgs-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .orgs-table th {
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

  .orgs-table td {
    padding: 8px var(--space-2);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .orgs-table tr:last-child td { border-bottom: none; }
  .orgs-table tr:hover td { background: var(--color-accent-light); }
  .disabled-row td { opacity: 0.45; }

  .mono { font-family: var(--font-mono); font-size: var(--text-sm); }

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

  .toggle-on { background: var(--color-primary); color: #fff; }
  .toggle-off { background: var(--color-surface-sunken); color: var(--color-text-muted); border: 1px solid var(--color-border); }
  .toggle-btn:hover { opacity: 0.8; }

  .row-actions {
    display: flex;
    gap: var(--space-half);
    align-items: center;
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

  .editing-row td { background: var(--color-accent-light); }
</style>
