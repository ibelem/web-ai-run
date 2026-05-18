<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ProfileData } from './+page.server';

  let { data, form } = $props<{ data: { profile: ProfileData | null }; form: any }>();

  let saving = $state(false);
</script>

<div class="profile-page">
  <header class="page-header">
    <h1>Profile</h1>
    <p>Manage your account information.</p>
  </header>

  {#if data.profile}
    <div class="profile-card">
      <div class="avatar-section">
        {#if data.profile.avatar_url}
          <img src={data.profile.avatar_url} alt="Avatar" class="avatar" crossorigin="anonymous" />
        {:else}
          <div class="avatar-placeholder">
            {data.profile.display_name?.[0]?.toUpperCase() ?? '?'}
          </div>
        {/if}
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
            <input
              type="text"
              name="display_name"
              value={data.profile.display_name ?? ''}
              placeholder="Your name"
            />
          </label>

          <label class="field">
            <span class="field-label">Email</span>
            <input type="email" value={data.profile.email} disabled />
            <span class="field-hint">Managed by your OAuth provider</span>
          </label>

          <label class="field">
            <span class="field-label">Organization</span>
            <input
              type="text"
              name="organization"
              value={data.profile.organization ?? ''}
              placeholder="Company or team"
            />
          </label>

          <label class="field">
            <span class="field-label">Job title</span>
            <input
              type="text"
              name="job_title"
              value={data.profile.job_title ?? ''}
              placeholder="Your role"
            />
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

    <div class="meta-section">
      <p class="meta">Member since {new Date(data.profile.created_at).toLocaleDateString()}</p>
    </div>
  {/if}
</div>

<style>
  .profile-page {
    max-width: 560px;
  }

  .profile-card {
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface-raised);
  }

  .avatar-section {
    display: flex;
    align-items: center;
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
    font-family: var(--font-ui);
    font-size: var(--text-base);
    padding: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color var(--transition-base);
  }

  .field input:focus {
    border-color: var(--color-focus-ring);
  }

  .field input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-base);
    background: var(--color-text-primary);
    color: var(--color-surface);
    cursor: pointer;
    transition: opacity var(--transition-base);
  }

  .btn-primary:hover { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

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

  .meta-section {
    margin-top: var(--space-2);
  }

  .meta {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
</style>
