# Avatar: Gravatar + Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic Gravatar support and a custom photo upload to `/account` for email/password users, with the uploaded photo propagating to the nav avatar.

**Architecture:** Gravatar is tried client-side via `onerror` fallback (already implemented in `src/lib/utils/gravatar.ts`). Uploads go browser → Supabase Storage (`avatars/{userId}/avatar.jpg`) with Canvas compression, then the public URL is written to `profiles.avatar_url`. The layout server conditionally fetches `profiles.avatar_url` for email users so the nav shows the right avatar. OAuth users are unaffected throughout.

**Tech Stack:** SvelteKit (Svelte 5 runes), Supabase JS v2 (`@supabase/ssr`), Supabase Storage, Canvas API for client-side JPEG compression, SQL migration for Storage RLS.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/utils/gravatar.ts` | Already exists (untracked) | MD5 + Gravatar URL builder |
| `supabase/migrations/019_avatar_storage_policy.sql` | Create | Storage RLS for `avatars` bucket |
| `src/routes/+layout.server.ts` | Modify | Conditionally fetch `profileAvatarUrl` for email users |
| `src/routes/+layout.svelte` | Modify | Apply priority stack (uploaded → Gravatar → initials) for email users |
| `src/routes/account/+page.server.ts` | Modify | Add `updateAvatar` form action |
| `src/routes/account/+page.svelte` | Modify | Upload UI in Profile tab, email-users-only |

---

## Task 1: Commit the existing Gravatar utility

The file `src/lib/utils/gravatar.ts` already exists in the working tree (untracked). This task commits it along with the already-modified `+layout.svelte` and `+page.svelte` (login copy tweak) so the working tree is clean before further changes.

**Files:**
- Commit: `src/lib/utils/gravatar.ts`
- Commit: `src/routes/+layout.svelte` (already modified with Gravatar fallback)
- Commit: `src/routes/login/+page.svelte` (OTP hint copy tweak)

- [ ] **Step 1: Verify working tree state**

```bash
git status
```

Expected output shows:
```
M  src/routes/+layout.svelte
 M src/routes/login/+page.svelte
?? src/lib/utils/
```

- [ ] **Step 2: Stage and commit**

```bash
git add src/lib/utils/gravatar.ts src/routes/+layout.svelte src/routes/login/+page.svelte
git commit -m "feat: add Gravatar fallback avatar in nav, gravatar utility"
```

- [ ] **Step 3: Confirm clean state**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

---

## Task 2: Create Supabase Storage migration

The `avatars` bucket must exist in Supabase (created manually in the dashboard or via CLI) and have RLS policies allowing users to manage their own files and public read.

**Files:**
- Create: `supabase/migrations/019_avatar_storage_policy.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/019_avatar_storage_policy.sql` with this content:

```sql
-- Storage RLS for avatars bucket.
-- The bucket itself must be created as a PUBLIC bucket in the Supabase dashboard
-- (Storage → New bucket → Name: "avatars", Public: true) before applying policies.

-- Allow authenticated users to upload/update/delete only their own folder.
-- Object paths are: {userId}/avatar.jpg
-- storage.foldername(name) returns an array; element [1] is the first path segment.
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

create policy "Users manage own avatar"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Public read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
```

- [ ] **Step 2: Apply migration to Supabase**

Run via Supabase CLI (if linked):
```bash
supabase db push
```

Or apply manually via Supabase dashboard SQL editor if CLI push isn't available.

- [ ] **Step 3: Verify bucket exists**

In the Supabase dashboard → Storage, confirm the `avatars` bucket appears as public.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/019_avatar_storage_policy.sql
git commit -m "feat: add avatars storage bucket and RLS policies"
```

---

## Task 3: Layout server — fetch `profileAvatarUrl` for email users

Email users have no `user_metadata.avatar_url` or `user_metadata.picture`. For those users, fetch `profiles.avatar_url` so the nav can show their uploaded photo.

**Files:**
- Modify: `src/routes/+layout.server.ts`

- [ ] **Step 1: Update `+layout.server.ts`**

Replace the entire file content with:

```typescript
import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types/roles';

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = await locals.getSession();

  let role: Role = 'anonymous';
  if (session?.user) {
    role = (session.user.app_metadata?.role as Role) ?? 'member';
  }

  // For email/magic-link users (no OAuth provider photo), fetch their uploaded avatar
  let profileAvatarUrl: string | null = null;
  const hasOAuthPhoto = !!(
    session?.user?.user_metadata?.avatar_url ||
    session?.user?.user_metadata?.picture
  );
  if (session?.user && !hasOAuthPhoto) {
    const { data } = await locals.supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', session.user.id)
      .single();
    profileAvatarUrl = data?.avatar_url ?? null;
  }

  return {
    session,
    role,
    profileAvatarUrl,
  };
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.server.ts
git commit -m "feat: fetch profileAvatarUrl for email users in layout server"
```

---

## Task 4: Layout template — apply priority stack

Wire `data.profileAvatarUrl` into the nav avatar for email users. The three-tier priority is: uploaded photo → Gravatar → initials.

**Files:**
- Modify: `src/routes/+layout.svelte`

The current layout already has Gravatar as a fallback between the OAuth photo and the initials placeholder (added in Task 1 commit). We need to insert the `profileAvatarUrl` check *before* the Gravatar check for email users.

- [ ] **Step 1: Update the avatar block in `+layout.svelte`**

Find this block (around line 189–210):

```svelte
{#if data.session?.user?.user_metadata?.avatar_url || data.session?.user?.user_metadata?.picture}
  <img
    src={data.session.user.user_metadata.avatar_url ?? data.session.user.user_metadata.picture}
    alt="Avatar"
    class="nav-avatar"
    loading="lazy"
    crossorigin="anonymous"
  />
{:else if data.session?.user?.email && !gravatarFailed}
  <img
    src={gravatarUrl(data.session.user.email, 60)}
    alt="Avatar"
    class="nav-avatar"
    loading="lazy"
    crossorigin="anonymous"
    onerror={() => { gravatarFailed = true; }}
  />
{:else}
  <span class="nav-avatar-placeholder">
    {data.session?.user?.user_metadata?.full_name?.[0]?.toUpperCase() ?? data.session?.user?.email?.[0]?.toUpperCase() ?? '?'}
  </span>
{/if}
```

Replace it with:

```svelte
{#if data.session?.user?.user_metadata?.avatar_url || data.session?.user?.user_metadata?.picture}
  <img
    src={data.session.user.user_metadata.avatar_url ?? data.session.user.user_metadata.picture}
    alt="Avatar"
    class="nav-avatar"
    loading="lazy"
    crossorigin="anonymous"
  />
{:else if data.profileAvatarUrl}
  <img
    src={data.profileAvatarUrl}
    alt="Avatar"
    class="nav-avatar"
    loading="lazy"
    crossorigin="anonymous"
  />
{:else if data.session?.user?.email && !gravatarFailed}
  <img
    src={gravatarUrl(data.session.user.email, 60)}
    alt="Avatar"
    class="nav-avatar"
    loading="lazy"
    crossorigin="anonymous"
    onerror={() => { gravatarFailed = true; }}
  />
{:else}
  <span class="nav-avatar-placeholder">
    {data.session?.user?.user_metadata?.full_name?.[0]?.toUpperCase() ?? data.session?.user?.email?.[0]?.toUpperCase() ?? '?'}
  </span>
{/if}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: show uploaded avatar in nav for email users"
```

---

## Task 5: Account server — add `updateAvatar` action

Add a `updateAvatar` form action to `+page.server.ts` that writes (or clears) `profiles.avatar_url`.

**Files:**
- Modify: `src/routes/account/+page.server.ts`

- [ ] **Step 1: Add the `updateAvatar` action**

In `src/routes/account/+page.server.ts`, add to the `actions` export object (after the existing `update` action):

```typescript
updateAvatar: async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw redirect(302, '/login');

  const formData = await request.formData();
  const avatar_url = (formData.get('avatar_url') as string | null) || null;

  const { error } = await (locals.supabase.from('profiles') as any)
    .update({ avatar_url })
    .eq('id', session.user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
},
```

The full `actions` export should now look like:

```typescript
export const actions: Actions = {
  update: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw redirect(302, '/login');

    const formData = await request.formData();
    const display_name = formData.get('display_name') as string | null;
    const organization = formData.get('organization') as string | null;
    const job_title = formData.get('job_title') as string | null;

    const { error } = await (locals.supabase.from('profiles') as any)
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
  },

  updateAvatar: async ({ request, locals }) => {
    const session = await locals.getSession();
    if (!session) throw redirect(302, '/login');

    const formData = await request.formData();
    const avatar_url = (formData.get('avatar_url') as string | null) || null;

    const { error } = await (locals.supabase.from('profiles') as any)
      .update({ avatar_url })
      .eq('id', session.user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/account/+page.server.ts
git commit -m "feat: add updateAvatar form action to account page"
```

---

## Task 6: Account page — upload UI

Add the avatar upload/remove UI to the Profile tab. This is the largest task. The UI is only shown to email users (no OAuth provider photo).

**Files:**
- Modify: `src/routes/account/+page.svelte`

- [ ] **Step 1: Add script imports and state at the top of `<script>`**

After the existing imports and state variables (around line 10), add:

```typescript
import { createClient } from '$lib/supabase/client';
import { gravatarUrl } from '$lib/utils/gravatar';

const supabase = createClient();

// True if user signed in via OAuth (has a provider-managed avatar)
const hasOAuthPhoto = !!(
  data.session?.user?.user_metadata?.avatar_url ||
  data.session?.user?.user_metadata?.picture
);

let uploadedAvatarUrl = $state<string | null>(data.profile?.avatar_url ?? null);
let avatarUploading = $state(false);
let avatarError = $state('');
let gravatarFailedAccount = $state(false);
let fileInput: HTMLInputElement;

async function handleAvatarFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    avatarError = 'Image must be under 10 MB.';
    return;
  }

  avatarError = '';
  avatarUploading = true;

  try {
    // Compress via canvas at max 256×256, JPEG 80%
    const compressed = await compressImage(file);
    const userId = data.session!.user.id;
    const path = `${userId}/avatar.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    // Write URL to profiles via form action
    const fd = new FormData();
    fd.set('avatar_url', publicUrl);
    await fetch('?/updateAvatar', { method: 'POST', body: fd });

    uploadedAvatarUrl = publicUrl;
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
    await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);

    const fd = new FormData();
    fd.set('avatar_url', '');
    await fetch('?/updateAvatar', { method: 'POST', body: fd });

    uploadedAvatarUrl = null;
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
```

- [ ] **Step 2: Replace the avatar section in the Profile tab**

Find the current `avatar-section` block inside the `{:else if activeTab === 'profile'}` section:

```svelte
<div class="avatar-section">
  {#if data.profile.avatar_url}
    <img src={data.profile.avatar_url} alt="Avatar" class="avatar" loading="lazy" crossorigin="anonymous" />
  {:else}
    <div class="avatar-placeholder">
      {data.profile.display_name?.[0]?.toUpperCase() ?? '?'}
    </div>
  {/if}
  <span class="role-badge role-{data.profile.role}">{data.profile.role}</span>
</div>
```

Replace it with:

```svelte
<div class="avatar-section">
  <div class="avatar-upload-area">
    <!-- Avatar display -->
    <button
      class="avatar-button"
      class:uploading={avatarUploading}
      onclick={() => !hasOAuthPhoto && fileInput.click()}
      aria-label={hasOAuthPhoto ? 'Avatar' : 'Click to upload photo'}
      disabled={avatarUploading || hasOAuthPhoto}
      type="button"
    >
      {#if uploadedAvatarUrl}
        <img src={uploadedAvatarUrl} alt="Avatar" class="avatar" loading="lazy" crossorigin="anonymous" />
      {:else if data.profile.avatar_url && uploadedAvatarUrl === null}
        <!-- just removed -->
        <div class="avatar-placeholder">{data.profile.display_name?.[0]?.toUpperCase() ?? data.profile.email?.[0]?.toUpperCase() ?? '?'}</div>
      {:else if !hasOAuthPhoto && data.profile.email && !gravatarFailedAccount}
        <img
          src={gravatarUrl(data.profile.email, 80)}
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

    <!-- Upload controls (email users only) -->
    {#if !hasOAuthPhoto}
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
          onclick={() => fileInput.click()}
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
    {/if}
  </div>

  <span class="role-badge role-{data.profile.role}">{data.profile.role}</span>
</div>
```

- [ ] **Step 3: Add CSS for new avatar UI elements**

Add these styles to the `<style>` block (after the existing `.avatar-placeholder` rule):

```css
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
```

- [ ] **Step 4: Fix the `data.session` reference**

The account page `+page.svelte` uses `data.profile` but does not currently have `data.session`. The session is available via the layout, but the account page `load` function in `+page.server.ts` doesn't return it. We need it for `data.session.user.id` in the upload functions.

Add `session` to the account page load return in `src/routes/account/+page.server.ts`:

Find:
```typescript
return {
  recipes: recipesRes.data ?? [],
  sharedConfigs: sharedRes.data ?? [],
  results: resultsRes.data ?? [],
  profile: (profileRes.data as unknown as ProfileData) ?? null,
};
```

Replace with:
```typescript
return {
  session,
  recipes: recipesRes.data ?? [],
  sharedConfigs: sharedRes.data ?? [],
  results: resultsRes.data ?? [],
  profile: (profileRes.data as unknown as ProfileData) ?? null,
};
```

Also add `session` to `ProfileData`-adjacent types if needed — it's typed as `Session | null` from `@supabase/supabase-js`, but since `data` is typed as `any` in the page script (`let { data, form } = $props<{ data: any; form: any }>()`), this will just work.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Start dev server and manually test**

```bash
npm run dev
```

Test checklist (log in with an email/password account):
- [ ] Profile tab shows current avatar (Gravatar if account exists, else initials)
- [ ] "Upload photo" button is visible
- [ ] Clicking button opens file picker
- [ ] Selecting an image shows a spinner, then updates the avatar in-place
- [ ] Nav avatar in the top bar also reflects the new upload after page navigation
- [ ] "Change photo" label appears once a photo is set
- [ ] "Remove" button appears once a photo is set; clicking it clears back to Gravatar/initials
- [ ] Files > 10 MB show error message without uploading
- [ ] Logging in with GitHub/Google shows no upload UI

- [ ] **Step 7: Commit**

```bash
git add src/routes/account/+page.svelte src/routes/account/+page.server.ts
git commit -m "feat: avatar upload/remove UI on account profile tab"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|-----------------|-----------------|
| Gravatar with `d=404` + `onerror` | Task 1 (already in layout) |
| `gravatarUrl` utility committed | Task 1 |
| `avatars` bucket + RLS policies | Task 2 |
| `profileAvatarUrl` in layout server | Task 3 |
| Nav priority stack: upload → Gravatar → initials | Task 4 |
| `updateAvatar` form action | Task 5 |
| Upload UI, email users only | Task 6 |
| Canvas compression 256×256 JPEG 80% | Task 6 Step 1 (`compressImage`) |
| 10 MB file size check | Task 6 Step 1 |
| Spinner during upload | Task 6 Step 2 + Step 3 |
| Remove photo flow | Task 6 Step 1 (`removeAvatar`) + Step 2 |
| OAuth users unaffected | Task 6 (`hasOAuthPhoto` guard) |

All spec requirements covered. No placeholders. Type names consistent (`uploadedAvatarUrl`, `gravatarFailedAccount`, `hasOAuthPhoto`) across all tasks.
