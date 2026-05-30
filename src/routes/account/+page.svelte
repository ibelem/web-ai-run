<script lang="ts">
  import { enhance, deserialize } from '$app/forms';
  import type { SharedRunConfig } from '$lib/supabase/types';
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import { createClient } from '$lib/supabase/client';
  import { gravatarUrl } from '$lib/utils/gravatar';

  let { data, form } = $props<{ data: any; form: any }>();

  // svelte-ignore state_referenced_locally
  let sharedConfigs = $state([...data.sharedConfigs]);
  let saving = $state(false);

  const supabase = createClient();

  const oauthAvatarUrl = data.session?.user?.user_metadata?.avatar_url ?? data.session?.user?.user_metadata?.picture ?? null;

  // svelte-ignore state_referenced_locally
  let uploadedAvatarUrl = $state<string | null>(data.profile?.avatar_url ?? null);
  let avatarUploading = $state(false);
  let avatarError = $state('');
  let gravatarFailedAccount = $state(false);
  let fileInput = $state<HTMLInputElement>(undefined!);

  async function handleAvatarFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      avatarError = 'Image must be under 4 MB.';
      return;
    }

    avatarError = '';
    avatarUploading = true;

    try {
      const compressed = await compressImage(file);
      const userId = data.session!.user.id;
      const path = `${userId}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const fd = new FormData();
      fd.set('avatar_url', publicUrl);
      const res = await fetch('?/updateAvatar', { method: 'POST', headers: { Accept: 'application/json' }, body: fd });
      const result = deserialize(await res.text());
      if (result.type === 'failure' || result.type === 'error') {
        throw new Error((result.data as any)?.error ?? 'Failed to save avatar URL.');
      }

      uploadedAvatarUrl = `${publicUrl}?t=${Date.now()}`;
      await invalidateAll();
    } catch (err: any) {
      avatarError = err?.message ?? 'Upload failed. Please try again.';
    } finally {
      avatarUploading = false;
    }
  }

  async function removeAvatar() {
    avatarError = '';
    avatarUploading = true;

    try {
      const userId = data.session!.user.id;
      const { error: removeError } = await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);
      if (removeError) {
        avatarError = removeError.message ?? 'Could not delete photo. Please try again.';
        return;
      }

      const fd = new FormData();
      fd.set('avatar_url', '');
      const res = await fetch('?/updateAvatar', { method: 'POST', headers: { Accept: 'application/json' }, body: fd });
      const result = deserialize(await res.text());
      if (result.type === 'failure' || result.type === 'error') {
        throw new Error((result.data as any)?.error ?? 'Failed to clear avatar URL.');
      }

      uploadedAvatarUrl = null;
      await invalidateAll();
      gravatarFailedAccount = false;
    } catch (err: any) {
      avatarError = err?.message ?? 'Could not remove photo.';
    } finally {
      avatarUploading = false;
    }
  }

  function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 256;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
        } else {
          if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
          'image/jpeg',
          0.8
        );
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = url;
    });
  }

  const TABS = ['results', 'recipes', 'shared', 'profile'] as const;
  type Tab = typeof TABS[number];

  function getTabFromHash(): Tab {
    if (!browser) return 'results';
    const hash = location.hash.slice(1);
    return TABS.includes(hash as Tab) ? (hash as Tab) : 'results';
  }

  let activeTab = $state<Tab>(getTabFromHash());

  function setTab(tab: Tab) {
    activeTab = tab;
    history.replaceState(null, '', `#${tab}`);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function sharedConfigUrl(id: string): string {
    return `/run/s/${id}`;
  }

  function sharedConfigFullUrl(config: SharedRunConfig): string {
    const hash = new URLSearchParams();
    if (config.models?.length) {
      hash.set('models', config.models.map(m => `${m.hf_model_id}|${m.file_path}`).join(','));
    }
    if (config.backends?.length) hash.set('backend', config.backends.join(','));
    hash.set('n', String(config.iterations ?? 50));
    if (config.upload) hash.set('upload', '1');
    if (config.cpu) hash.set('cpu', config.cpu);
    if (config.os) hash.set('os', config.os);
    if (config.ort) hash.set('ort', config.ort);
    if (config.litert) hash.set('litert', config.litert);
    return `/run#${hash}`;
  }

  function sharedConfigSummary(config: SharedRunConfig): string {
    const models = config.models ?? [];
    const backends = config.backends?.join(', ') ?? '';
    const names = models.map(m => m.hf_model_id.split('/').pop() ?? m.hf_model_id).join(', ');
    return `${names} · ${backends}`;
  }

  async function deleteSharedConfig(id: string) {
    if (!confirm('Delete this shared link? Anyone with the URL will no longer be able to use it.')) return;
    await fetch(`/api/shared-config?id=${id}`, { method: 'DELETE' });
    sharedConfigs = sharedConfigs.filter((c: any) => c.id !== id);
  }

  async function deleteResult(id: string) {
    if (!confirm('Delete this result permanently?')) return;
    // TODO: add DELETE endpoint for results if needed
  }
</script>

<div class="account-page">
  <header class="page-header">
    <h1>Account</h1>
    <p>Manage your recipes, shared links, and benchmark results.</p>
  </header>

  <nav class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'results'}
      onclick={() => setTab('results')}
    >Results <span class="tab-count">{data.results.length}</span></button>
    <button
      class="tab"
      class:active={activeTab === 'recipes'}
      onclick={() => setTab('recipes')}
    >Recipes <span class="tab-count">{data.recipes.length}</span></button>
    <button
      class="tab"
      class:active={activeTab === 'shared'}
      onclick={() => setTab('shared')}
    >Shared Links <span class="tab-count">{sharedConfigs.length}</span></button>
    <button
      class="tab"
      class:active={activeTab === 'profile'}
      onclick={() => setTab('profile')}
    >Profile</button>
  </nav>

  <section class="tab-content">
    {#if activeTab === 'recipes'}
      {#if data.recipes.length === 0}
        <div class="empty">
          <p>No recipes yet.</p>
          <a href="/recipe/new" class="btn-outline">Create a recipe</a>
        </div>
      {:else}
        <ul class="item-list">
          {#each data.recipes as recipe (recipe.id)}
            <li class="item-row">
              <div class="item-main">
                <a href="/recipe/{recipe.slug}/edit" class="item-name">{recipe.name}</a>
                <span class="item-meta">
                  {recipe.models?.length ?? 0} model{(recipe.models?.length ?? 0) !== 1 ? 's' : ''}
                  · {recipe.visibility}
                  · {formatDate(recipe.updated_at)}
                </span>
              </div>
              <div class="item-actions">
                <a href="/recipe/{recipe.slug}/edit" class="btn-sm">Edit</a>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

    {:else if activeTab === 'shared'}
      {#if sharedConfigs.length === 0}
        <div class="empty">
          <p>No shared links yet. Use the Share button on the Benchmark page to create one.</p>
        </div>
      {:else}
        <ul class="item-list">
          {#each sharedConfigs as config (config.id)}
            <li class="item-row">
              <div class="item-main">
                <a href={sharedConfigUrl(config.id)} class="item-name item-name-mono">{formatDate(config.created_at)} · {config.id}</a>
                <span class="item-meta">
                  {sharedConfigSummary(config.config)}
                </span>
              </div>
              <div class="item-actions">
                <button class="btn-sm" onclick={() => { navigator.clipboard.writeText(location.origin + sharedConfigUrl(config.id)); }}>Copy Short</button>
                <button class="btn-sm" onclick={() => { navigator.clipboard.writeText(location.origin + sharedConfigFullUrl(config.config)); }}>Copy Full</button>
                <button class="btn-sm btn-sm-danger" onclick={() => deleteSharedConfig(config.id)}>Delete</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

    {:else if activeTab === 'results'}
      {#if data.results.length === 0}
        <div class="empty">
          <p>No benchmark results yet. Run a benchmark with "Upload results" enabled.</p>
        </div>
      {:else}
        <ul class="item-list">
          {#each data.results as result (result.id)}
            <li class="item-row">
              <div class="item-main">
                <a href="/results/{result.id}" class="item-name item-name-mono">
                  {result.model_id.split('/').pop() ?? result.model_id}
                </a>
                <span class="item-meta">
                  {result.backend}
                  · {result.status}
                  {#if result.average_ms}· {result.average_ms.toFixed(1)}ms avg{/if}
                  {#if result.throughput_fps}· {result.throughput_fps.toFixed(1)} fps{/if}
                  · {formatDate(result.started_at)}
                </span>
              </div>
              <div class="item-actions">
                <a href="/results/{result.id}" class="btn-sm">View</a>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

    {:else if activeTab === 'profile'}
      {#if data.profile}
        <div class="profile-card">
          <div class="avatar-section">
            <div class="avatar-upload-area">
              <button
                class="avatar-button"
                onclick={() => fileInput?.click()}
                aria-label="Click to upload photo"
                disabled={avatarUploading}
                type="button"
              >
                {#if uploadedAvatarUrl}
                  <img src={uploadedAvatarUrl} alt="Avatar" class="avatar" loading="lazy" crossorigin="anonymous" />
                {:else if oauthAvatarUrl}
                  <img src={oauthAvatarUrl} alt="Avatar" class="avatar" loading="lazy" crossorigin="anonymous" />
                {:else if data.profile.email && !gravatarFailedAccount}
                  <img
                    src={gravatarUrl(data.profile.email, 256)}
                    alt="Avatar"
                    class="avatar"
                    loading="lazy"
                    crossorigin="anonymous"
                    onerror={() => { gravatarFailedAccount = true; }}
                  />
                {:else}
                  <div class="avatar-placeholder">{data.profile.display_name?.[0]?.toUpperCase() ?? data.profile.email?.[0]?.toUpperCase() ?? '?'}</div>
                {/if}
                {#if avatarUploading}
                  <div class="avatar-spinner-overlay" aria-hidden="true"></div>
                {/if}
              </button>

              <input
                bind:this={fileInput}
                type="file"
                accept="image/*"
                class="avatar-file-input"
                onchange={handleAvatarFile}
              />
              <div class="avatar-actions">
                <button
                  type="button"
                  class="btn-sm"
                  onclick={() => fileInput?.click()}
                  disabled={avatarUploading}
                >
                  {uploadedAvatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {#if uploadedAvatarUrl}
                  <button
                    type="button"
                    class="btn-sm btn-sm-danger"
                    onclick={removeAvatar}
                    disabled={avatarUploading}
                  >
                    Remove
                  </button>
                {/if}
              </div>
              {#if avatarError}
                <p class="avatar-error">{avatarError}</p>
              {/if}
            </div>

            <span class="role-badge role-{data.profile.role}">{data.profile.role}</span>
          </div>

          <form
            method="POST"
            action="?/update"
            use:enhance={() => {
              saving = true;
              return async ({ update }) => {
                await update();
                saving = false;
              };
            }}
          >
            <div class="form-grid">
              <label class="field">
                <span class="field-label">Display name</span>
                <input type="text" name="display_name" value={data.profile.display_name ?? ''} placeholder="Your name" />
              </label>
              <label class="field">
                <span class="field-label">Email</span>
                <input type="email" value={data.profile.email} disabled />
                <span class="field-hint">Managed by your OAuth provider</span>
              </label>
              <label class="field">
                <span class="field-label">Organization</span>
                <input type="text" name="organization" value={data.profile.organization ?? ''} placeholder="Company or team" />
              </label>
              <label class="field">
                <span class="field-label">Job title</span>
                <input type="text" name="job_title" value={data.profile.job_title ?? ''} placeholder="Your role" />
              </label>
            </div>

            {#if form?.error}
              <p class="form-error">{form.error}</p>
            {/if}
            {#if form?.success}
              <p class="form-success">Profile updated.</p>
            {/if}

            <button type="submit" class="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
        <p class="meta">Member since {new Date(data.profile.created_at).toLocaleDateString('en-US')}</p>
      {/if}
    {/if}
  </section>
</div>

<style>
  .account-page {
    max-width: 100%;
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-3);
  }

  .tab {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color var(--transition-base), border-color var(--transition-base);
  }

  .tab:hover {
    color: var(--color-text-primary);
  }

  .tab.active {
    color: var(--color-text-primary);
    border-bottom-color: var(--color-primary);
  }

  .tab-count {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 9px;
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    margin-left: 4px;
  }

  .tab.active .tab-count {
    background: var(--color-primary);
    color: var(--color-text-on-primary);
  }

  .tab-content {
    min-height: 200px;
  }

  .item-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    transition: background var(--transition-base);
  }

  .item-row:hover {
    background: var(--color-surface-sunken);
  }

  .item-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }

  .item-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-name:hover {
    color: var(--color-primary);
  }

  .item-name-mono {
    font-family: var(--font-mono);
  }

  .item-meta {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-actions {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .btn-sm {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: none;
    transition: border-color var(--transition-base), color var(--transition-base);
  }

  .btn-sm:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .btn-sm-danger:hover {
    border-color: var(--color-error);
    color: var(--color-error);
  }

  .btn-outline {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 8px 16px;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-base);
    background: none;
    color: var(--color-primary);
    text-decoration: none;
    transition: background var(--transition-base);
  }

  .btn-outline:hover {
    background: var(--color-accent-light);
  }

  /* Profile tab */
  .profile-card {
    max-width: 560px;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface-raised);
  }

  .avatar-section {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
  }

  .avatar-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-lg);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .avatar-upload-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .avatar-button {
    position: relative;
    border: none;
    background: none;
    padding: 0;
    border-radius: 50%;
    cursor: pointer;
    display: block;
  }

  .avatar-button:disabled {
    cursor: default;
  }

  .avatar-button .avatar,
  .avatar-button .avatar-placeholder {
    width: 80px;
    height: 80px;
    font-size: var(--text-xl);
  }

  .avatar-spinner-overlay {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.35);
  }

  .avatar-spinner-overlay::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .avatar-file-input {
    display: none;
  }

  .avatar-actions {
    display: flex;
    gap: var(--space-1);
  }

  .avatar-error {
    font-size: var(--text-xs);
    color: var(--color-error);
    text-align: center;
    max-width: 200px;
  }

  .role-badge {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .role-member { background: var(--color-surface-sunken); color: var(--color-text-secondary); }
  .role-partner { background: #e3f2fd; color: #1565c0; }
  .role-intel { background: #fce4ec; color: #c62828; }
  .role-admin { background: #f3e5f5; color: #6a1b9a; }

  .form-grid {
    display: grid;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-half);
  }

  .field-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .field-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .field input {
    width: 100%;
  }

  .field input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 8px 16px;
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-primary);
    color: var(--color-text-on-primary);
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-error {
    font-size: var(--text-sm);
    color: var(--color-error);
    margin-bottom: var(--space-1);
  }

  .form-success {
    font-size: var(--text-sm);
    color: var(--color-success);
    margin-bottom: var(--space-1);
  }

  .meta {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: var(--space-2);
  }

  @media (max-width: 640px) {
    .tabs {
      overflow-x: auto;
    }

    .item-row {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-1);
    }

    .item-actions {
      width: 100%;
    }

    .btn-sm {
      flex: 1;
      text-align: center;
    }
  }
</style>
