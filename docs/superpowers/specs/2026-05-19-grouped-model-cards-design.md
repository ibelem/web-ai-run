# Grouped Model Cards with Dtype Chips

**Date:** 2026-05-19  
**Status:** Approved

---

## Problem

The model list shows one card per variant (one per data type). A model file with fp16, int8, q4, q4f16 variants produces 4 identical-looking rows — same repo name, same filename, only the dtype tag differs. This wastes vertical space and makes the list harder to scan.

---

## Solution

Group cards by `(hf_model_id, stripped_filename)`. One card per unique filename. Data type variants become clickable chips on the right side of the card. The card body is inert — only chips are interactive.

---

## Card Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [task]  onnx-community / Qwen2.5-0.5B      [fp16] [int8✓] [q4] │
│ [onnx]  onnx/model  ·  29–97 MB            [q4f16✓]            │
└──────────────────────────────────────────────────────────────────┘
```

**Left side (inert):**
- Row 1: task tag (if not "uncategorized") + repo name (monospace)
- Row 2: format badge + stripped filename (monospace, muted) + size range

**Right side (interactive):**
- Dtype chips, wrapping up to 2 rows, max-width ~200px
- Each chip independently clickable — toggles selection of that variant
- Chip states: unselected (outlined, colored border+text), selected (filled background)
- Chip hover: slight lift (translateY -1px), reduced opacity

**Card states:**
- Default: neutral border
- Any chip selected: card gets a soft highlight border (info color at 50% opacity) + tinted background
- In library (DB list only): "In library" badge on the card left side, row 1

**No checkbox.** No cursor pointer on card body. Card `pointer-events` on body = none except chips.

---

## Grouping Logic

### DB models (ModelGrid / ModelCard)

Input: flat array of `ModelRow[]`, each with a unique `id`.

Group key: `${hf_model_id}::${stripExt(file_path)}::${inferFormat(file_path)}`

Each group produces one card with:
- `variants`: `{ id: string; dataType: string; sizeBytes: number }[]` — one per DB row in the group
- `hfModelId`, `filePath` (stripped), `format`, `sourceOrg`, `task` — from any row in group (all identical)
- `sizeRange`: `{ min: number; max: number }` — min/max of `sizeBytes` across variants

Chip click → `ontoggle(variant.id)` — same interface as today, no downstream changes needed.

Per-chip size shown as tooltip (`title` attribute): `formatSize(variant.sizeBytes)`.

Card-level size display: `formatSize(min)` if all same, otherwise `formatSize(min)–formatSize(max)`.

### HFSearch

Files are already grouped under a repo. Within each repo, group files by `stripExt(file.path)`.

Each group produces one card with:
- `files`: `HFFile[]` — one per variant in the group
- Shared: `path` (stripped), `format`, `runtime`

Chip click → existing `toggleFile(repoId, file, task)` — no change to selection logic.

Per-chip size shown as tooltip: `formatSize(file.size)`.

### HFUrlImport

Same as HFSearch — group `ImportedFile[]` by `stripExt(file.path)` within each repo.

---

## Component Changes

### `ModelCard.svelte` → `ModelCard.svelte` (rewrite props)

Old props: `hfModelId, filePath, dataType, sizeBytes, runtime, sourceOrg, task, selected, ontoggle`

New props:
```ts
interface Variant {
  id: string;
  dataType: string;
  sizeBytes: number;
}
interface Props {
  hfModelId: string;
  filePath: string;       // already stripped by caller
  format: string;
  sourceOrg: string;
  task: string;
  inLibrary?: boolean;
  variants: Variant[];
  selectedIds?: Set<string>;
  ontoggle?: (id: string) => void;
}
```

### `ModelGrid.svelte`

Add grouping derived computation before rendering. Pass grouped data to `ModelCard`.

Pagination count stays based on number of **groups** (not raw model count), but the footer shows total model count: "X models (Y files)".

### `HFSearch.svelte`

Add a `groupFiles(files: HFFile[])` helper that returns `GroupedFile[]`. Render one grouped card per group instead of one `file-card` per file.

The existing `repo-group` / `repo-header` structure stays — grouping is only within the file list inside each repo.

### `HFUrlImport.svelte`

Same grouping helper as HFSearch. Same rendering change within each repo's file list.

---

## Data Type Color Map

Preserved from current implementation:

| dtype     | color   |
|-----------|---------|
| fp32      | #6ea8fe |
| fp16      | #8b5cf6 |
| bf16      | #7c3aed |
| fp8       | #a855f7 |
| int8      | #06b6d4 |
| uint8     | #0891b2 |
| int4      | #10b981 |
| uint4     | #059669 |
| q4        | #16a34a |
| q4f16     | #6366f1 |
| bnb4      | #f59e0b |
| quantized | #ea580c |

---

## Selection Count

Selecting fp16 + int8 from the same grouped card counts as **2 selections**. Each chip = one benchmark job, one recipe row. `selectedIds` is a flat `Set<string>` of DB row ids — no change to ActionPanel or Recipe logic.

For HF models: each chip adds one `SelectedHFModel` entry — same as today.

---

## Edge Cases

- **Single variant:** Card shows one chip. Works identically — just one chip instead of many.
- **All variants in library (DB list):** "In library" badge shows. Chips still selectable (user may want to re-run).
- **Group with mismatched tasks/formats:** Not possible — same `(hf_model_id, file_path_stem)` always has the same format and task.
- **stripExt collision:** Two different files that share a stripped name within the same repo (e.g. `model.onnx` and `model.tflite`) are handled safely because the group key includes the format — `model.onnx` → `onnx` and `model.tflite` → `tflite` produce distinct keys.

---

## Dtype Filter Interaction (left sidebar)

The existing `selectedDataTypes: Set<string>` filter continues to work. After grouping, filtering applies at the **variant level within each card**:

- A card is **shown** if at least one of its variants has a `dataType` in `selectedDataTypes` (or if no dtype filter is active).
- Only **matching chips are shown** on the card — chips for non-matching variants are hidden entirely (Option A).
- If the filter removes all chips from a card, the card is hidden.

This means the card count in the footer reflects groups with at least one visible variant, and the chip set on each visible card is already pre-filtered — no extra UI state needed.

**Implementation:** The grouping step produces `Variant[]` per group. The filter step maps each group's variants through `selectedDataTypes` before passing to the card component:

```ts
const visibleVariants = selectedDataTypes.size > 0
  ? group.variants.filter(v => selectedDataTypes.has(v.dataType))
  : group.variants;
// hide group entirely if no variants survive the filter
if (visibleVariants.length === 0) return null;
```

This keeps all existing filter chip logic in `+page.svelte` unchanged — only the model-card rendering layer changes.

---

## Out of Scope

- Sorting/filtering by dtype (existing filter chips handle this at the variant level as described above)
- "Select all variants" for a card
- Expanding a card to show per-variant details beyond the tooltip
