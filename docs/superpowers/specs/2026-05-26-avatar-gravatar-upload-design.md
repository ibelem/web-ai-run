# Avatar: Gravatar + Upload — Design Spec

## Overview

Two-tier avatar system for email/password users:

1. **Gravatar** — automatic, zero effort, tried via `d=404` with `onerror` fallback
2. **Upload** — user uploads a photo on `/account` Profile tab; stored in Supabase Storage, URL written to `profiles.avatar_url`

OAuth users (GitHub/Google/Microsoft) keep their provider photo. No upload UI is shown to them.

---

## Avatar Priority Stack

### OAuth users (have `user_metadata.avatar_url` or `picture`)
- Show provider photo
- No upload UI, no Gravatar

### Email/magic-link users (no provider photo)
1. `profileAvatarUrl` from `profiles.avatar_url` — user-uploaded photo
2. Gravatar `https://www.gravatar.com/avatar/{md5(email)}?s=60&d=404` with `onerror` fallback
3. Initials placeholder

---

## Data Flow

### Nav avatar (layout)

`+layout.server.ts` conditionally fetches `profiles.avatar_url`:

```
if session && no OAuth provider photo:
  query profiles.avatar_url for session.user.id
  return profileAvatarUrl
else:
  return profileAvatarUrl: null
```

`+layout.svelte` receives `data.profileAvatarUrl` and applies the priority stack for email users.

### Upload flow (client-side)

1. User clicks "Upload photo" → hidden `<input type="file" accept="image/*">` opens
2. On file select:
   - Draw image to hidden `<canvas>` at max 256×256 (preserve aspect ratio)
   - Export as JPEG 80% quality via `canvas.toBlob('image/jpeg', 0.8)`
   - Upload blob to Supabase Storage: `avatars/{userId}/avatar.jpg` (upsert)
   - On success: POST to `?/updateAvatar` with the public URL
   - `profiles.avatar_url` is updated in DB
3. Avatar in UI updates reactively

### Remove flow

- User clicks "Remove photo"
- Deletes `avatars/{userId}/avatar.jpg` from Storage
- POST to `?/updateAvatar` with `null` URL
- `profiles.avatar_url` set to null; falls back to Gravatar or initials

---

## Components / Files Changed

| File | Change |
|------|--------|
| `src/routes/+layout.server.ts` | Conditional DB fetch for `profileAvatarUrl` |
| `src/routes/+layout.svelte` | Apply priority stack using `data.profileAvatarUrl` |
| `src/routes/account/+page.server.ts` | Add `updateAvatar` form action |
| `src/routes/account/+page.svelte` | Upload UI in Profile tab (email users only) |
| `src/lib/utils/gravatar.ts` | Already exists (untracked) — commit as-is |
| `supabase/migrations/019_avatar_storage_policy.sql` | Storage RLS policies for `avatars` bucket |

---

## Supabase Storage

**Bucket:** `avatars` — public bucket (no auth required to read URLs)

**Object path:** `{userId}/avatar.jpg` — one file per user, always overwritten

**RLS policies:**
```sql
-- Allow users to upload/overwrite/delete only their own folder
create policy "Users manage own avatar"
  on storage.objects for all
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public read
create policy "Public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');
```

---

## Account Profile Tab UI

Shown only when user has no OAuth provider photo (`!session.user.user_metadata?.avatar_url && !session.user.user_metadata?.picture`).

```
[ avatar image 80px ]   ← clickable, opens file picker
  Upload photo          ← button (or "Change photo" if avatar_url set)
  Remove photo          ← only shown if profiles.avatar_url is set
```

States:
- **Idle** — show current avatar (uploaded / Gravatar / placeholder)
- **Uploading** — spinner overlay on avatar, buttons disabled
- **Error** — inline error message below buttons
- **Success** — avatar updates immediately (reactive `profileAvatarUrl` local state)

Image constraints enforced client-side:
- Max canvas output: 256×256
- Format: JPEG
- Quality: 80%
- Max input file size check: warn if > 10 MB before processing

---

## What Is NOT in Scope

- Server-side image processing (all compression is client-side canvas)
- Cropping UI
- Multiple avatars / history
- Changing OAuth provider photo
