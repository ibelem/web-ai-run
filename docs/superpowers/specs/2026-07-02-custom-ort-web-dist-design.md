# Custom ONNX Runtime Web Dist — Design

**Date:** 2026-07-02
**Status:** Approved design, pre-implementation
**Author:** brainstormed with Claude

## Goal

Currently, `/inference/run` and `/inference/custom` let a user pick an ONNX
Runtime Web version from npm's published dev/stable releases, fetched via
jsDelivr (e.g. `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0-dev.../dist/ort.jspi.min.mjs`).
Users who build their own ORT Web bundle (e.g. testing an unreleased patch,
a custom WASM build, or a fork) have no way to point the benchmark at it.

Add support for a self-hosted/self-built ORT Web dist, identified by a full
URL to its `.mjs` entry file, e.g.:
```
https://ibelem.github.io/onnxruntime-web-dist/20260702-dynamic-shape/ort.jspi.min.mjs
```

## Scope

In scope:
- A "Custom build…" option in the existing ORT Web version dropdown on both
  `/inference/run` and `/inference/custom`.
- Worker support for loading an ORT Web `.mjs` module from an arbitrary URL
  instead of the jsDelivr CDN, deriving the WASM asset path from that URL.
- Sharing (URL hash `ort=` param, `/api/shared-config` share links) and
  localStorage persistence (`run_prefs.ort`) work for a custom URL exactly as
  they already do for a version string — no schema changes.
- The "Custom build…" option is visible only to `partner`, `intel`, and
  `admin` roles — hidden entirely for `member` and logged-out users.

Out of scope (YAGNI / later):
- LiteRT custom dist (this request is ORT Web only).
- A history/favorites list of previously used custom URLs — one remembered
  value, matching every other pref field (cpu, os, driver versions, webnn_ep).
- Pre-flight validation (HEAD request) of the custom URL before allowing a run.
- Preserving a typed custom URL in memory when the user switches from
  "Custom build…" to a preset version and back in the same session — switching
  away clears it, same as switching between any two presets today.

## Design

### Detecting "custom" mode — no new state variable

`ortVersion` (existing `$state<string>`) already holds either an npm version
string (`1.27.0-dev.20260505-b81f3f8558`) or, going forward, a full URL.
npm version strings never start with `http`, so custom mode is a pure
derivation with no new persisted flag:

```ts
const isCustomOrt = $derived(ortVersion.startsWith('http'));
```

### UI (`/inference/run` and `/inference/custom`)

Add a sentinel option at the top of the existing ORT Web `<select>`:

```svelte
<select class="sb-input" value={isCustomOrt ? '__custom__' : ortVersion} onchange={handleOrtSelect}>
  <option value="__custom__">Custom build…</option>
  <optgroup label="Dev">...</optgroup>
  <optgroup label="Stable">...</optgroup>
</select>
{#if isCustomOrt}
  <input
    class="sb-input"
    type="text"
    placeholder="https://.../ort.*.mjs"
    bind:value={ortVersion}
  />
{/if}
```

`handleOrtSelect`: if the selected value is `__custom__`, set `ortVersion = ''`
(empty string is itself `isCustomOrt === false` momentarily until the user
types a URL — acceptable since the text input renders immediately and the Run
button is already gated elsewhere on required fields being non-empty via
existing `usesOnnx && ortVersion` checks). Otherwise set `ortVersion` to the
selected preset version string directly (existing behavior, unchanged).

No client-side URL format validation (e.g. regex for `.mjs` suffix) — an
invalid URL fails naturally at `import()` in the worker and surfaces through
the existing error path (see below). Adding validation here would duplicate
that failure mode for no benefit.

### URL hash / share link — no changes required

`parseHash()` / `writeHash()` in `/inference/run/+page.svelte` already read
and write `ort` as an opaque string via `URLSearchParams`, which
percent-encodes `:` and `/` automatically. A custom URL round-trips as-is:

```
#...&ort=https%3A%2F%2Fibelem.github.io%2Fonnxruntime-web-dist%2F20260702-dynamic-shape%2Fort.jspi.min.mjs
```

The `/api/shared-config` payload (`ort: usesOnnx && ortVersion ? ortVersion : undefined`)
is likewise a free-form string field — no schema change.

### localStorage — no changes required

`run_prefs.ort` (in `savePrefs()` / `loadPrefs()`) already persists whatever
string is currently in `ortVersion`. On a later visit with no hash override:

```ts
ortVersion = parsed.ort || prefs.ort || v.ort.dev[0] || v.ort.stable[0] || "";
```

`prefs.ort` restores the custom URL automatically; `isCustomOrt` re-derives to
`true`, so the dropdown shows "Custom build…" selected and the text input
pre-fills with the same URL. A hash-carrying link (e.g. a Share link) takes
priority for that one visit only — same precedence every other field already
follows.

### Worker (`src/lib/engine/worker/inference.worker.ts`)

Replace `getOrtCdnUrl(version)` with a function that branches on whether
`runtimeVersion` is a URL:

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

In `runOrt`, replace:
```ts
const url = getOrtCdnUrl(runtimeVersion);
const ort = await import(/* @vite-ignore */ url);
const cdnBase = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${runtimeVersion}/dist/`;
ort.env.wasm.wasmPaths = cdnBase;
```
with:
```ts
const { moduleUrl, wasmBase } = getOrtDistUrls(runtimeVersion);
const ort = await import(/* @vite-ignore */ moduleUrl);
ort.env.wasm.wasmPaths = wasmBase;
```

`status(id, "Loading ONNX Runtime Web v${runtimeVersion}...")` stays as-is —
for a custom URL, `runtimeVersion` is the URL itself, which is already a
meaningful, if long, status/log line. No special-casing needed.

`getOrtExecutionProvider`, session creation, tensor building, and the LiteRT
path (`runLiteRt` / `getLiteRtCdnUrl`) are untouched.

### Error handling

An unreachable or malformed custom URL throws inside `await import(moduleUrl)`.
This is already caught by the outer `try/catch` in `self.onmessage`, which
builds an `errorResult` and posts it back — identical to how an invalid/typo'd
npm version fails today. No new error handling required.

### Access control

The "Custom build…" option and its dist-URL input are gated to `partner`,
`intel`, and `admin` roles — `member` and logged-out (`anonymous`) users must
not see them at all. `ROLE_HIERARCHY` is
`['anonymous', 'member', 'partner', 'intel', 'admin']`, so the gate is:

```ts
const canUseCustomOrt = $derived(isAtLeast($auth.role ?? 'anonymous', 'partner'));
```

- `/inference/run` already imports `auth` (`$lib/stores/auth`) and `isAtLeast`
  (`$lib/types/roles`) for the existing GPU/NPU-driver gating — reuse those
  imports, add this one derived value.
- `/inference/custom` has no auth-awareness today (no `auth` store import at
  all) — add the same two imports there for the first time, mirroring the
  exact pattern already used on `/inference/run`.
- The `<option value="__custom__">Custom build…</option>` and the `{#if
  isCustomOrt}` dist-URL `<input>` both render only when `canUseCustomOrt` is
  true. A member/anonymous user sees the unchanged Dev/Stable-only dropdown.
- Scope decision: this hides the *entry point* only. If a `member` opens a
  `partner`'s shared run-config link that already carries a custom URL in the
  `ort` hash param, the value still flows through `ortVersion` and the worker
  will use it if the benchmark is run — we don't add logic to detect and
  strip a custom URL for a lower-privileged viewer. That's a materially
  bigger feature (needs a fallback version, a message explaining why, etc.)
  than "don't show the UI," which is the literal ask.

### Results / DB

No changes. `ort_version` is an existing free-text column, written from
`ortVersion` in `ResultsWriter`, and displayed as `ORT Web ${r.ort_version}` on
results pages. A custom URL just renders as a (longer) string there.

## Testing

- Manual: select "Custom build…", paste the example dist URL, run a WebGPU
  benchmark, confirm the model loads and metrics populate.
- Manual: refresh the page with no hash — confirm the custom URL and "Custom
  build…" selection are restored from `localStorage`.
- Manual: use Share on a config with a custom URL, open the share link in a
  fresh session — confirm the custom URL loads from the hash.
- Manual: paste an unreachable URL, run — confirm the existing error path
  (queue item → `error` status, message surfaced in logs) fires instead of a
  silent hang or unhandled rejection.
- No unit tests planned — `getOrtDistUrls` is a small pure function; if a
  future refactor separates worker logic into testable modules, add one then.

## Migration

None. No DB schema changes, no new URL params, no new localStorage keys.
