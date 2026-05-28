# Profile & Role Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a profile page where users edit their name/org/title, show user identity in the nav, and build an admin panel for role management.

**Architecture:** Profile page reads/writes to existing `profiles` table via Supabase client. Admin panel uses server-side load to fetch all profiles (requires admin role check). New DB migration adds `organization` and `job_title` columns. Nav shows avatar + dropdown menu for authenticated users.

**Tech Stack:** SvelteKit 5 (Svelte 5 runes), Supabase (PostgreSQL + RLS), TypeScript, CSS custom properties

---

### Task 1: Database Migration — Add organization and job_title columns

**Files:**
- Create: `supabase/migrations/006_profile_fields.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add organization and job_title fields to profiles
alter table public.profiles add column organization text;
alter table public.profiles add column job_title text;
```

- [ ] **Step 2: Update TypeScript types**

In `src/lib/supabase/types.ts`, update the `profiles` table type:

```typescript
profiles: {
  Row: {
    id: string;
    email: string;
    role: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
    display_name: string | null;
    avatar_url: string | null;
    organization: string | null;
    job_title: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id: string;
    email: string;
    role?: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
    display_name?: string | null;
    avatar_url?: string | null;
    organization?: string | null;
    job_title?: string | null;
  };
  Update: {
    role?: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
    display_name?: string | null;
    avatar_url?: string | null;
    organization?: string | null;
    job_title?: string | null;
  };
};
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_profile_fields.sql src/lib/supabase/types.ts
git commit -m "feat: add organization and job_title columns to profiles"
```

---

### Task 2: Profile Page — Server Load

**Files:**
- Create: `src/routes/profile/+page.server.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/routes/profile/load.test.ts
import { describe, it, expect } from 'vitest';

describe('profile page load', () => {
  it('module exports a load function', async () => {
    const mod = await import('$lib/../routes/profile/+page.server');
    expect(typeof mod.load).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/routes/profile/load.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the server load function**

```typescript
// src/routes/profile/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) {
    redirect(303, '/');
  }

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('id, email, role, display_name, avatar_url, organization, job_title, created_at')
    .eq('id', session.user.id)
    .single();

  return { profile };
};

export const actions: Actions = {
  update: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) {
      redirect(303, '/');
    }

    const formData = await request.formData();
    const display_name = formData.get('display_name') as string | null;
    const organization = formData.get('organization') as string | null;
    const job_title = formData.get('job_title') as string | null;

    const { error } = await locals.supabase
      .from('profiles')
      .update({
        display_name: display_name?.trim() || null,
        organization: organization?.trim() || null,
        job_title: job_title?.trim() || null,
      })
      .eq('id', session.user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/routes/profile/load.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/profile/+page.server.ts tests/routes/profile/load.test.ts
git commit -m "feat: add profile page server load and update action"
```

---

### Task 3: Profile Page — UI Component

**Files:**
- Create: `src/routes/profile/+page.svelte`

- [ ] **Step 1: Create the profile page component**

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();

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
          <img src={data.profile.avatar_url} alt="Avatar" class="avatar" />
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

  .page-header {
    margin-bottom: var(--space-3);
  }

  .page-header h1 {
    font-size: var(--text-xl);
    font-weight: 300;
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
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
    padding: var(--space-1) var(--space-3);
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
```

- [ ] **Step 2: Verify the page renders**

Run dev server and navigate to `/profile` while signed in. Verify:
- Avatar and role badge display
- Form fields pre-fill from profile data
- Email field is disabled
- Save button works (submit form, see success message)

- [ ] **Step 3: Commit**

```bash
git add src/routes/profile/+page.svelte
git commit -m "feat: add profile page UI with edit form"
```

---

### Task 4: Nav — Show User Identity

**Files:**
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Update the layout to show user avatar and profile link**

Replace the auth section in the nav-right div. When authenticated, show avatar image (or initial) + a dropdown with "Profile" link and "Sign out" button. When not authenticated, show "Sign in" button.

Changes to `src/routes/+layout.svelte`:

In the `<script>` block, add:
```typescript
let showUserMenu = $state(false);
```

Replace the `{#if $isAuthenticated}` block with:

```svelte
{#if $isAuthenticated}
  <div class="user-menu-wrapper">
    <button
      class="user-trigger"
      onclick={() => showUserMenu = !showUserMenu}
      aria-expanded={showUserMenu}
    >
      {#if data.session?.user?.user_metadata?.avatar_url}
        <img
          src={data.session.user.user_metadata.avatar_url}
          alt="Avatar"
          class="nav-avatar"
        />
      {:else}
        <span class="nav-avatar-placeholder">
          {data.session?.user?.user_metadata?.full_name?.[0]?.toUpperCase() ?? '?'}
        </span>
      {/if}
    </button>
    {#if showUserMenu}
      <div class="user-dropdown">
        <a href="/profile" class="dropdown-item" onclick={() => showUserMenu = false}>Profile</a>
        <button class="dropdown-item" onclick={() => { showUserMenu = false; signOut(); }}>
          Sign out
        </button>
      </div>
    {/if}
  </div>
{:else}
  <button class="nav-item" onclick={() => signIn('github')}>Sign in</button>
{/if}
```

Add these styles:

```css
.user-menu-wrapper {
  position: relative;
}

.user-trigger {
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 50%;
  display: flex;
  align-items: center;
}

.nav-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.nav-avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.user-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: var(--space-half);
  min-width: 146px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-dropdown);
  z-index: var(--z-dropdown);
  padding: var(--space-half) 0;
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: var(--space-half) var(--space-2);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  text-decoration: none;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
}

.dropdown-item:hover {
  background: var(--color-nav-item-hover);
}
```

- [ ] **Step 2: Test in browser**

Verify:
- Signed out: "Sign in" button shows
- Signed in: Avatar circle shows, clicking opens dropdown with "Profile" and "Sign out"
- Clicking "Profile" navigates to `/profile`
- Clicking outside closes the dropdown (optional enhancement, can skip for now)

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: show user avatar with dropdown menu in nav"
```

---

### Task 5: Admin Page — Server Load with Role Gate

**Files:**
- Create: `src/routes/admin/users/+page.server.ts`

- [ ] **Step 1: Write the admin server load**

```typescript
// src/routes/admin/users/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) {
    redirect(303, '/');
  }

  const role = session.user.app_metadata?.role;
  if (role !== 'admin') {
    error(403, 'Admin access required');
  }

  const { data: users } = await locals.supabase
    .from('profiles')
    .select('id, email, role, display_name, avatar_url, organization, job_title, created_at')
    .order('created_at', { ascending: true });

  return { users: users ?? [] };
};

export const actions: Actions = {
  setRole: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) {
      redirect(303, '/');
    }

    const adminRole = session.user.app_metadata?.role;
    if (adminRole !== 'admin') {
      error(403, 'Admin access required');
    }

    const formData = await request.formData();
    const userId = formData.get('user_id') as string;
    const newRole = formData.get('role') as string;

    if (!userId || !newRole) {
      return { success: false, error: 'Missing user_id or role' };
    }

    const { error: rpcError } = await locals.supabase.rpc('set_user_role', {
      target_user_id: userId,
      new_role: newRole,
    });

    if (rpcError) {
      return { success: false, error: rpcError.message };
    }

    return { success: true, userId, newRole };
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/admin/users/+page.server.ts
git commit -m "feat: add admin users page server load with role gate"
```

---

### Task 6: Admin Page — UI Component

**Files:**
- Create: `src/routes/admin/users/+page.svelte`

- [ ] **Step 1: Create the admin users page**

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import { ROLE_HIERARCHY } from '$lib/types/roles';

  let { data, form } = $props();
</script>

<div class="admin-page">
  <header class="page-header">
    <h1>User Management</h1>
    <p>{data.users.length} registered users</p>
  </header>

  {#if form?.error}
    <div class="error-banner">
      <p>{form.error}</p>
    </div>
  {/if}

  {#if form?.success}
    <div class="success-banner">
      <p>Role updated successfully.</p>
    </div>
  {/if}

  <div class="users-table-wrapper">
    <table class="users-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Email</th>
          <th>Organization</th>
          <th>Title</th>
          <th>Role</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        {#each data.users as user}
          <tr>
            <td class="user-cell">
              {#if user.avatar_url}
                <img src={user.avatar_url} alt="" class="table-avatar" />
              {/if}
              <span>{user.display_name ?? '—'}</span>
            </td>
            <td class="mono">{user.email}</td>
            <td>{user.organization ?? '—'}</td>
            <td>{user.job_title ?? '—'}</td>
            <td>
              <form method="POST" action="?/setRole" use:enhance>
                <input type="hidden" name="user_id" value={user.id} />
                <select name="role" onchange="this.form.requestSubmit()">
                  {#each ROLE_HIERARCHY as role}
                    <option value={role} selected={user.role === role}>{role}</option>
                  {/each}
                </select>
              </form>
            </td>
            <td class="mono">{new Date(user.created_at).toLocaleDateString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .admin-page {
    max-width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-3);
  }

  .page-header h1 {
    font-size: var(--text-xl);
    font-weight: 300;
    margin-bottom: var(--space-half);
  }

  .page-header p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
  }

  .error-banner {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    color: var(--color-error);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .success-banner {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-success);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    color: var(--color-success);
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }

  .users-table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .users-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .users-table th {
    text-align: left;
    padding: var(--space-1) var(--space-3);
    font-weight: 500;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-raised);
    white-space: nowrap;
  }

  .users-table td {
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .users-table tr:last-child td {
    border-bottom: none;
  }

  .user-cell {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .table-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  select {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 2px 4px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
  }
</style>
```

- [ ] **Step 2: Test in browser**

Navigate to `/admin/users` while signed in as admin. Verify:
- Non-admin users see a 403 error
- Admin sees the user table with all profiles
- Changing a role dropdown immediately submits and updates
- Success/error banners display appropriately

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin/users/+page.svelte
git commit -m "feat: add admin user management page with role selector"
```

---

### Task 7: Admin RLS Policy Update

**Files:**
- Create: `supabase/migrations/007_admin_read_all_profiles.sql`

The existing RLS policy for admin read-all checks `auth.jwt() -> 'app_metadata' ->> 'role'`. We also need an admin policy for update (to allow `set_user_role` to work through RLS when called via RPC). The `set_user_role` function uses `security definer` so it bypasses RLS, but we need the admin page's `select` to work for listing all users.

- [ ] **Step 1: Verify existing policies cover the admin use case**

The existing migration `001_profiles.sql` already has:
- "Admins can read all profiles" policy checking JWT role
- `set_user_role()` is `security definer` (bypasses RLS)

No additional migration needed if the admin's JWT has `role: 'admin'` in `app_metadata`. The initial admin must be set directly in Supabase dashboard.

- [ ] **Step 2: Document first-admin bootstrap**

Add a comment in the migration file:

```sql
-- 007: No schema changes needed.
-- To bootstrap the first admin user:
--   1. Find your user ID in auth.users
--   2. Run: UPDATE public.profiles SET role = 'admin' WHERE id = '<your-user-id>';
--   3. Run: UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE id = '<your-user-id>';
--   4. Sign out and back in to refresh your JWT
```

Create the file as documentation:

```sql
-- Bootstrap: Setting the first admin user
-- Run these in Supabase SQL editor:
--
--   UPDATE public.profiles SET role = 'admin' WHERE id = '<your-user-id>';
--   UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE id = '<your-user-id>';
--
-- Then sign out and back in to refresh the JWT with the new role claim.
-- After that, use the /admin/users page to manage other users' roles.

-- No schema changes in this migration.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_admin_read_all_profiles.sql
git commit -m "docs: add admin bootstrap instructions as migration comment"
```

---

### Task 8: Add Profile Link to Nav Items

**Files:**
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Add admin nav item for admin users**

In the nav-left section, conditionally show an "Admin" link when the user has the admin role. The role is already available from `data.role` (returned by `+layout.server.ts`).

After the existing `navItems` loop, add:

```svelte
{#if data.role === 'admin'}
  <a
    href="/admin/users"
    class="nav-item"
    class:active={$page.url.pathname.startsWith('/admin')}
  >
    Admin
  </a>
{/if}
```

- [ ] **Step 2: Test in browser**

Verify:
- Non-admin users don't see "Admin" link
- Admin users see "Admin" in the nav
- Clicking it navigates to the user management page

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: show admin nav link for admin users"
```

---

### Task 9: Integration Test — Profile Flow

**Files:**
- Create: `tests/routes/profile/profile.test.ts`

- [ ] **Step 1: Write smoke tests for profile module**

```typescript
import { describe, it, expect } from 'vitest';
import { ROLE_HIERARCHY, isAtLeast } from '$lib/types/roles';

describe('Profile & Role Management', () => {
  it('ROLE_HIERARCHY has 5 tiers in correct order', () => {
    expect(ROLE_HIERARCHY).toEqual(['anonymous', 'member', 'partner', 'intel', 'admin']);
  });

  it('isAtLeast correctly compares roles', () => {
    expect(isAtLeast('admin', 'member')).toBe(true);
    expect(isAtLeast('member', 'admin')).toBe(false);
    expect(isAtLeast('partner', 'partner')).toBe(true);
    expect(isAtLeast('anonymous', 'member')).toBe(false);
  });

  it('profile server module is importable', async () => {
    const mod = await import('../../src/routes/profile/+page.server');
    expect(typeof mod.load).toBe('function');
    expect(typeof mod.actions.update).toBe('function');
  });

  it('admin server module is importable', async () => {
    const mod = await import('../../src/routes/admin/users/+page.server');
    expect(typeof mod.load).toBe('function');
    expect(typeof mod.actions.setRole).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/routes/profile/profile.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/routes/profile/profile.test.ts
git commit -m "test: add profile and role management smoke tests"
```

---

### Task 10: Type Check and Final Verification

- [ ] **Step 1: Run type check**

Run: `npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Manual browser verification**

1. Sign in with GitHub OAuth
2. Navigate to `/profile` — verify form loads with OAuth data
3. Edit organization and job title, save — verify success message
4. Check nav — avatar shows with dropdown
5. If admin: navigate to `/admin/users` — verify user table
6. If not admin: navigate to `/admin/users` — verify 403

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve any type errors or test failures"
```
