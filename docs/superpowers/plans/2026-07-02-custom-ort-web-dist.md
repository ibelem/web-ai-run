# Custom ONNX Runtime Web Dist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user point the ONNX Runtime Web benchmark at a self-built/self-hosted dist (a full URL to an `.mjs` entry file) instead of only a published npm version, on both `/inference/run` and `/inference/custom`.

**Architecture:** The existing `ortVersion` string (already flowing from UI state → URL hash → localStorage → worker `runtimeVersion` param) is reused unchanged to also hold a full URL. "Custom mode" is a pure derivation (`ortVersion.startsWith('http')`) — no new state, no new URL param, no new localStorage key, no DB schema change. The worker's dist-URL builder gains a branch: if `runtimeVersion` looks like a URL, use it directly as the ESM import and derive the WASM asset directory from it; otherwise keep today's jsDelivr CDN construction.

**Tech Stack:** SvelteKit 5 (runes: `$state`/`$derived`), TypeScript, a classic Web Worker (`inference.worker.ts`) that inlines all its helpers (see the file's own header comment — do not add imports to it).

## Global Constraints

- `src/lib/engine/worker/inference.worker.ts` must stay `type: 'classic'` — do not add `import` statements to it; all logic must stay inlined in that file (per its own header comment, lines 1-4).
- No new URL param, no new localStorage key, no DB migration — the existing `ort` hash param, `run_prefs.ort` localStorage field, and `ort_version` DB column already accept an arbitrary string.
- The "Custom build…" option and its dist-URL input must be visible only to `partner`, `intel`, and `admin` roles (`ROLE_HIERARCHY = ['anonymous', 'member', 'partner', 'intel', 'admin']` in `src/lib/types/roles.ts`) — gate on `isAtLeast($auth.role ?? 'anonymous', 'partner')`. `member` and logged-out users must see the unchanged Dev/Stable-only dropdown, with no trace of the custom option.
- No pre-flight (HEAD) validation of a custom URL — an unreachable/malformed URL must fail through the existing worker error path, not a new one.
- Do not touch `src/lib/engine/runtime-loader.ts` — it has same-named functions (`getOrtCdnUrl`/`getOrtExecutionProvider`) but is dead code (no callers anywhere in `src`, confirmed via codegraph — only its own test file references it). It is unrelated to this feature; leave it alone.
- LiteRT is out of scope — do not modify `getLiteRtCdnUrl` or `runLiteRt`.

---

### Task 1: Worker — resolve a custom dist URL

**Files:**
- Modify: `src/lib/engine/worker/inference.worker.ts:299-301` (the `getOrtCdnUrl` function)
- Modify: `src/lib/engine/worker/inference.worker.ts:352-356` (its call site inside `runOrt`)

**Interfaces:**
- Produces: `getOrtDistUrls(runtimeVersion: string): { moduleUrl: string; wasmBase: string }` — replaces `getOrtCdnUrl`, used only inside this file (by `runOrt`, Task 1 only). Not exported, not consumed by any other task.

- [ ] **Step 1: Replace `getOrtCdnUrl` with `getOrtDistUrls`**

In `src/lib/engine/worker/inference.worker.ts`, find:

```ts
function getOrtCdnUrl(version: string): string {
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/ort.jspi.min.mjs`;
}
```

Replace it with:

```ts
function getOrtDistUrls(runtimeVersion: string): { moduleUrl: string; wasmBase: string } {
  if (/^https?:\/\//i.test(runtimeVersion)) {
    const moduleUrl = runtimeVersion;
    const wasmBase = moduleUrl.slice(0, moduleUrl.lastIndexOf('/') + 1);
    return { moduleUrl, wasmBase };
  }
  const wasmBase = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${runtimeVersion}/dist/`;
  return { moduleUrl: `${wasmBase}ort.jspi.min.mjs`, wasmBase };
}
```

- [ ] **Step 2: Verify the branching logic by hand**

This file has no automated test coverage today (it's a classic worker with top-level side effects — a console-wrapping IIFE and a `self.onmessage` assignment — that make it an awkward import target; the design doc for this feature explicitly scoped out adding worker tests). Verify the pure string logic manually instead:

Run:
```bash
node -e "
function getOrtDistUrls(runtimeVersion) {
  if (/^https?:\/\//i.test(runtimeVersion)) {
    const moduleUrl = runtimeVersion;
    const wasmBase = moduleUrl.slice(0, moduleUrl.lastIndexOf('/') + 1);
    return { moduleUrl, wasmBase };
  }
  const wasmBase = \`https://cdn.jsdelivr.net/npm/onnxruntime-web@\${runtimeVersion}/dist/\`;
  return { moduleUrl: \`\${wasmBase}ort.jspi.min.mjs\`, wasmBase };
}
console.log(getOrtDistUrls('1.27.0-dev.20260505-b81f3f8558'));
console.log(getOrtDistUrls('https://ibelem.github.io/onnxruntime-web-dist/20260702-dynamic-shape/ort.jspi.min.mjs'));
"
```

Expected output:
```
{
  moduleUrl: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0-dev.20260505-b81f3f8558/dist/ort.jspi.min.mjs',
  wasmBase: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0-dev.20260505-b81f3f8558/dist/'
}
{
  moduleUrl: 'https://ibelem.github.io/onnxruntime-web-dist/20260702-dynamic-shape/ort.jspi.min.mjs',
  wasmBase: 'https://ibelem.github.io/onnxruntime-web-dist/20260702-dynamic-shape/'
}
```

Confirm both shapes match before moving on — the second one is the case that didn't work before this change.

- [ ] **Step 3: Update the call site in `runOrt`**

In the same file, find (inside `async function runOrt`):

```ts
  status(id, `Loading ONNX Runtime Web v${runtimeVersion}...`);
  const url = getOrtCdnUrl(runtimeVersion);
  const ort = await import(/* @vite-ignore */ url);
  const cdnBase = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${runtimeVersion}/dist/`;
  ort.env.wasm.wasmPaths = cdnBase;
  ort.env.logLevel = 'verbose';
  ort.env.debug = false;
```

Replace with:

```ts
  status(id, `Loading ONNX Runtime Web v${runtimeVersion}...`);
  const { moduleUrl, wasmBase } = getOrtDistUrls(runtimeVersion);
  const ort = await import(/* @vite-ignore */ moduleUrl);
  ort.env.wasm.wasmPaths = wasmBase;
  ort.env.logLevel = 'verbose';
  ort.env.debug = false;
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: no new errors introduced in `inference.worker.ts` (pre-existing unrelated errors elsewhere, if any, are not this task's concern).

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/worker/inference.worker.ts
git commit -m "$(cat <<'EOF'
Support a custom ONNX Runtime Web dist URL in the inference worker

runtimeVersion may now be a full URL to an .mjs entry file (a self-built
or self-hosted dist) instead of only an npm version string. The WASM
asset base path is derived from the URL's own directory.
EOF
)"
```

---

### Task 2: Custom ORT dropdown — `/inference/run`

**Files:**
- Modify: `src/routes/inference/run/+page.svelte:201-205` (derived-values block)
- Modify: `src/routes/inference/run/+page.svelte:1236-1256` (ORT Web `<select>` markup)

**Interfaces:**
- Consumes: existing `ortVersion` (`$state<string>`, declared line 182), `ortDevVersions` / `ortStableVersions` (`$state<string[]>`, lines 183-184), and the already-imported `auth` store (`$lib/stores/auth`) / `isAtLeast` (`$lib/types/roles`) — unchanged.
- Produces: `isCustomOrt` (`$derived<boolean>`), `canUseCustomOrt` (`$derived<boolean>`), and `handleOrtSelect(e: Event): void` — used only in this file's markup (Task 2 only; Task 3 defines its own independent copies in `custom/+page.svelte`, since the two pages already duplicate this whole sidebar section and this feature follows that existing pattern rather than introducing a new shared component).

- [ ] **Step 1: Add the derived flags and select handler**

In `src/routes/inference/run/+page.svelte`, find:

```ts
  const totalModels = $derived(hashModels.length);
  const usesOnnx = $derived(hashModels.some((m) => m.runtime === "onnx"));
  const usesLitert = $derived(hashModels.some((m) => m.runtime === "litert"));
  const usesWebnn = $derived(selectedBackends.some((b) => b.startsWith("webnn_")));
  const usesWebnnNpu = $derived(selectedBackends.includes("webnn_npu"));
```

Replace with:

```ts
  const totalModels = $derived(hashModels.length);
  const usesOnnx = $derived(hashModels.some((m) => m.runtime === "onnx"));
  const usesLitert = $derived(hashModels.some((m) => m.runtime === "litert"));
  const usesWebnn = $derived(selectedBackends.some((b) => b.startsWith("webnn_")));
  const usesWebnnNpu = $derived(selectedBackends.includes("webnn_npu"));
  const isCustomOrt = $derived(ortVersion.startsWith("http"));
  // Custom build entry point is partner/intel/admin only; member and
  // logged-out users never see the option or the URL input (see Global
  // Constraints). This mirrors the existing isAtLeast(...,'intel') gate
  // used for GPU/NPU driver fields further down this same file.
  const canUseCustomOrt = $derived(isAtLeast($auth.role ?? "anonymous", "partner"));

  function handleOrtSelect(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    // Seed with "https://" rather than "" so the row's existing
    // `usesOnnx && ortVersion` guard (further down) stays truthy and the
    // custom-URL input doesn't disappear the instant it's selected.
    ortVersion = value === "__custom__" ? "https://" : value;
  }
```

- [ ] **Step 2: Add the role-gated "Custom build…" option and conditional URL input**

In the same file, find:

```svelte
          {#if usesOnnx && ortVersion}
            <div class="sb-row">
              <span class="sb-label">ORT Web</span>
              <select class="sb-input" bind:value={ortVersion}>
                {#if ortDevVersions.length}
                  <optgroup label="Dev">
                    {#each ortDevVersions as v}
                      <option value={v}>{v}</option>
                    {/each}
                  </optgroup>
                {/if}
                {#if ortStableVersions.length}
                  <optgroup label="Stable">
                    {#each ortStableVersions as v}
                      <option value={v}>{v}</option>
                    {/each}
                  </optgroup>
                {/if}
              </select>
            </div>
          {/if}
```

Replace with:

```svelte
          {#if usesOnnx && ortVersion}
            <div class="sb-row">
              <span class="sb-label">ORT Web</span>
              <select
                class="sb-input"
                value={isCustomOrt && canUseCustomOrt ? "__custom__" : ortVersion}
                onchange={handleOrtSelect}
              >
                {#if canUseCustomOrt}
                  <option value="__custom__">Custom build…</option>
                {/if}
                {#if ortDevVersions.length}
                  <optgroup label="Dev">
                    {#each ortDevVersions as v}
                      <option value={v}>{v}</option>
                    {/each}
                  </optgroup>
                {/if}
                {#if ortStableVersions.length}
                  <optgroup label="Stable">
                    {#each ortStableVersions as v}
                      <option value={v}>{v}</option>
                    {/each}
                  </optgroup>
                {/if}
              </select>
            </div>
            {#if isCustomOrt && canUseCustomOrt}
              <div class="sb-row">
                <span class="sb-label">Dist URL</span>
                <input
                  class="sb-input"
                  type="text"
                  placeholder="https://.../ort.*.mjs"
                  bind:value={ortVersion}
                />
              </div>
            {/if}
          {/if}
```

Note: the outer guard stays `usesOnnx && ortVersion` (unchanged) — it already works correctly because `handleOrtSelect` seeds `"https://"` (truthy), not `""`, when switching into custom mode. If `ortVersion` already holds a custom URL (e.g. restored from a shared link) but `canUseCustomOrt` is false, the `<select>`'s `value` falls back to `ortVersion` itself, which won't match any rendered `<option>` — the browser will show no visible selection, but `ortVersion` (and therefore what a Run would actually use) is untouched. This is the explicit scope decision from the design doc: hide the entry point, don't strip an already-set value.

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`

In the browser, go to `/inference/run` with at least one ONNX model selected (pick one from `/inference/browse` first if `hashModels` is empty). While signed out (or signed in as a `member`), confirm the ORT Web dropdown shows only Dev/Stable groups — no "Custom build…" option anywhere. Then, signed in as `partner`, `intel`, or `admin` (whichever test account is available), confirm:
1. The ORT Web dropdown shows "Custom build…" above the Dev/Stable groups.
2. Selecting it reveals a "Dist URL" text input pre-filled with `https://`.
3. Typing a URL keeps the dropdown showing "Custom build…" selected (doesn't snap back to a version).
4. Selecting a Dev or Stable version from the dropdown hides the Dist URL input again.

If no non-member test account is available in this environment, it's acceptable to verify the signed-out/member case fully (option absent) and verify the privileged-role code path by temporarily and locally forcing `canUseCustomOrt` to `true` in the browser devtools/Svelte inspector for a visual check, then removing the override — do not commit any temporary override.

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: no new errors in `src/routes/inference/run/+page.svelte`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/inference/run/+page.svelte
git commit -m "$(cat <<'EOF'
Add custom ORT Web dist URL option to the Benchmark page

Selecting "Custom build..." in the ORT Web dropdown reveals a text
field for a full dist URL, which flows through the existing
ortVersion state (and therefore the existing URL hash / localStorage
persistence) unchanged. Gated to partner/intel/admin roles.
EOF
)"
```

---

### Task 3: Custom ORT dropdown — `/inference/custom`

**Files:**
- Modify: `src/routes/inference/custom/+page.svelte:79-81` (derived-values block)
- Modify: `src/routes/inference/custom/+page.svelte:543-559` (ORT Web `<select>` markup)

**Interfaces:**
- Consumes: existing `ortVersion` (`$state<string>`, declared line 40), `ortDevVersions` / `ortStableVersions` (lines 41-42) — unchanged. Newly consumes `auth` (`$lib/stores/auth`) and `isAtLeast` (`$lib/types/roles`) — this page has never imported either before.
- Produces: `isCustomOrt`, `canUseCustomOrt`, and `handleOrtSelect` — same shape as Task 2, independently defined in this file (this page has no `run_prefs`-style persistence at all today, so there is nothing extra to wire up here beyond the UI itself).

- [ ] **Step 1: Import the auth store and role helper**

In `src/routes/inference/custom/+page.svelte`, find the import block near the top:

```ts
  import { isRunning as isRunningStore } from '$lib/stores/benchmark';
```

Replace with:

```ts
  import { isRunning as isRunningStore } from '$lib/stores/benchmark';
  import { auth } from '$lib/stores/auth';
  import { isAtLeast } from '$lib/types/roles';
```

- [ ] **Step 2: Add the derived flags and select handler**

In the same file, find:

```ts
  const runtime = $derived(file ? inferRuntime(file.name) : null);
  const usesOnnx = $derived(runtime === 'onnx');
  const usesLitert = $derived(runtime === 'litert');
```

Replace with:

```ts
  const runtime = $derived(file ? inferRuntime(file.name) : null);
  const usesOnnx = $derived(runtime === 'onnx');
  const usesLitert = $derived(runtime === 'litert');
  const isCustomOrt = $derived(ortVersion.startsWith('http'));
  const canUseCustomOrt = $derived(isAtLeast($auth.role ?? 'anonymous', 'partner'));

  function handleOrtSelect(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value;
    ortVersion = value === '__custom__' ? 'https://' : value;
  }
```

- [ ] **Step 3: Add the role-gated "Custom build…" option and conditional URL input**

In the same file, find:

```svelte
          {#if usesOnnx && ortVersion}
            <div class="sb-row">
              <span class="sb-label">ORT Web</span>
              <select class="sb-input" bind:value={ortVersion}>
                {#if ortDevVersions.length}
                  <optgroup label="Dev">
                    {#each ortDevVersions as v}<option value={v}>{v}</option>{/each}
                  </optgroup>
                {/if}
                {#if ortStableVersions.length}
                  <optgroup label="Stable">
                    {#each ortStableVersions as v}<option value={v}>{v}</option>{/each}
                  </optgroup>
                {/if}
              </select>
            </div>
          {/if}
```

Replace with:

```svelte
          {#if usesOnnx && ortVersion}
            <div class="sb-row">
              <span class="sb-label">ORT Web</span>
              <select
                class="sb-input"
                value={isCustomOrt && canUseCustomOrt ? '__custom__' : ortVersion}
                onchange={handleOrtSelect}
              >
                {#if canUseCustomOrt}
                  <option value="__custom__">Custom build…</option>
                {/if}
                {#if ortDevVersions.length}
                  <optgroup label="Dev">
                    {#each ortDevVersions as v}<option value={v}>{v}</option>{/each}
                  </optgroup>
                {/if}
                {#if ortStableVersions.length}
                  <optgroup label="Stable">
                    {#each ortStableVersions as v}<option value={v}>{v}</option>{/each}
                  </optgroup>
                {/if}
              </select>
            </div>
            {#if isCustomOrt && canUseCustomOrt}
              <div class="sb-row">
                <span class="sb-label">Dist URL</span>
                <input
                  class="sb-input"
                  type="text"
                  placeholder="https://.../ort.*.mjs"
                  bind:value={ortVersion}
                />
              </div>
            {/if}
          {/if}
```

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev` (skip if still running from Task 2)

Signed out (or as `member`), go to `/inference/custom` and drag/select an `.onnx` file — confirm the ORT Web dropdown shows only Dev/Stable groups, no "Custom build…" option. Then, as `partner`/`intel`/`admin`, confirm the same four behaviors as Task 2 Step 3 (custom option visible, input appears with `https://` seed, dropdown stays on "Custom build…" while typing, switching to a preset version hides the input again). Same fallback as Task 2 Step 3 if no non-member test account is available.

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no new errors in `src/routes/inference/custom/+page.svelte`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/inference/custom/+page.svelte
git commit -m "$(cat <<'EOF'
Add custom ORT Web dist URL option to the Custom Benchmark page

Mirrors the same "Custom build..." dropdown option added to
/inference/run for consistency between the two upload/run pages.
Gated to partner/intel/admin roles.
EOF
)"
```

---

### Task 4: End-to-end verification

No file changes — this task exercises the full flow from the design doc's Testing section using the three prior tasks together.

**Files:** none

**Interfaces:** none (verification only)

- [ ] **Step 1: Full run with a real custom dist**

Run: `npm run dev`

On `/inference/run` with an ONNX model selected: select "Custom build…", paste
`https://ibelem.github.io/onnxruntime-web-dist/20260702-dynamic-shape/ort.jspi.min.mjs`
into the Dist URL field, pick the `webgpu` backend, click "Run Benchmark".

Expected: the status line shows `Loading ONNX Runtime Web v https://ibelem.github.io/.../ort.jspi.min.mjs...`, the model downloads, compiles, and the benchmark completes with populated metrics (no error row).

- [ ] **Step 2: Persistence across reload**

Refresh the page (no URL hash — plain `/inference/run` reload, or navigate away and back within the same tab so `sessionStorage`/`localStorage` state is intact).

Expected: the ORT Web dropdown shows "Custom build…" selected and the Dist URL field is pre-filled with the same URL from Step 1, with no action needed from the user.

- [ ] **Step 3: Share link round-trip**

While signed in, with the custom URL still active, click "Share". Open the resulting `/run/s/<id>` URL in a fresh private/incognito window.

Expected: the config loads with the ORT Web dropdown on "Custom build…" and the Dist URL field populated with the same URL (verifies the `ort` hash param survives encoding a full URL with `:` and `/`).

- [ ] **Step 4: Error path for an unreachable URL**

Back on `/inference/run`, set the Dist URL field to an obviously-bad URL, e.g. `https://example.invalid/ort.jspi.min.mjs`, and run the benchmark.

Expected: the queue item ends in `error` status (not a hang or an uncaught exception in the console), and the Logs panel shows an error line referencing the failed load — the existing worker error path, unchanged by this feature.

- [ ] **Step 5: Confirm no regression on preset versions**

Switch back to a Dev or Stable version in the dropdown and run once more.

Expected: behaves exactly as before this feature — no change to the non-custom path.

No commit for this task (verification only). If any step fails, return to the relevant earlier task, fix, and re-run this task from Step 1.
