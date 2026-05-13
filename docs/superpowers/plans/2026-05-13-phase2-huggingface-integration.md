# Phase 2: HuggingFace Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-discover ML models from HuggingFace organizations, parse their files to determine runtime/data type, sync the catalog to Supabase, and present a filterable model browser on the `/model` page.

**Architecture:** A TypeScript HuggingFace API client queries model repos from configured orgs. A parser extracts runtime type (onnx/litert) and data type (fp32, fp16, int8, etc.) from filenames. A Supabase Edge Function runs daily to sync discoveries into the `models` table. The `/model` page fetches the catalog client-side and renders a filterable grid.

**Tech Stack:** SvelteKit 5, TypeScript, Supabase Edge Functions (Deno), HuggingFace Hub API (REST), Vitest

---

## File Structure

```
src/
  lib/
    huggingface/
      client.ts               — HF Hub API client (list repos, list files)
      parser.ts               — Extract runtime, data_type, size from file metadata
      types.ts                — HF API response types + ModelEntry type
      orgs.ts                 — Configured organizations/collections to sync
    components/
      ModelCard.svelte        — Single model card (name, org, data type badge, size)
      ModelFilters.svelte     — Filter bar (runtime, org, data type, search)
      ModelGrid.svelte        — Grid layout rendering ModelCard list
  routes/
    model/
      +page.svelte            — Model browser page (replaces stub)
      +page.ts                — Client-side load: fetch models from Supabase
supabase/
  functions/
    sync-models/
      index.ts                — Edge Function: daily HF sync → models table
  migrations/
    005_models_category.sql   — Add category column to models table
tests/
  lib/
    huggingface/
      client.test.ts          — Unit tests for HF API client
      parser.test.ts          — Unit tests for filename parser
```

---

### Task 1: HuggingFace Types

**Files:**
- Create: `src/lib/huggingface/types.ts`

- [ ] **Step 1: Create the HF API response types and internal model type**

Create `src/lib/huggingface/types.ts`:
```typescript
export interface HfRepoInfo {
  _id: string;
  id: string;
  modelId: string;
  author: string;
  pipeline_tag?: string;
  tags: string[];
  lastModified: string;
  private: boolean;
  disabled: boolean;
  downloads: number;
  likes: number;
}

export interface HfFileInfo {
  rfilename: string;
  size: number;
  lfs?: {
    sha256: string;
    size: number;
    pointerSize: number;
  };
}

export interface ModelEntry {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  size_bytes: number;
  runtime: 'onnx' | 'litert';
  source_org: string;
  category: string;
}

export interface SyncResult {
  inserted: number;
  updated: number;
  errors: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/huggingface/types.ts
git commit -m "feat(hf): add HuggingFace API and model entry types"
```

---

### Task 2: Organizations Config

**Files:**
- Create: `src/lib/huggingface/orgs.ts`

- [ ] **Step 1: Create the orgs config**

Create `src/lib/huggingface/orgs.ts`:
```typescript
export interface OrgConfig {
  name: string;
  runtime: 'onnx' | 'litert' | 'mixed';
}

export const HF_ORGS: OrgConfig[] = [
  { name: 'Xenova', runtime: 'onnx' },
  { name: 'onnx-community', runtime: 'onnx' },
  { name: 'webnn', runtime: 'onnx' },
  { name: 'webgpu', runtime: 'onnx' },
  { name: 'litert-community', runtime: 'litert' },
];

export const HF_API_BASE = 'https://huggingface.co/api';
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/huggingface/orgs.ts
git commit -m "feat(hf): add HuggingFace organizations config"
```

---

### Task 3: Filename Parser

**Files:**
- Create: `src/lib/huggingface/parser.ts`
- Create: `tests/lib/huggingface/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/huggingface/parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseModelFile, inferDataType, inferRuntime } from '$lib/huggingface/parser';

describe('inferRuntime', () => {
  it('detects onnx from .onnx extension', () => {
    expect(inferRuntime('model_fp16.onnx')).toBe('onnx');
  });

  it('detects litert from .tflite extension', () => {
    expect(inferRuntime('mobilenet_v3_small.tflite')).toBe('litert');
  });

  it('returns null for non-model files', () => {
    expect(inferRuntime('config.json')).toBeNull();
    expect(inferRuntime('README.md')).toBeNull();
    expect(inferRuntime('tokenizer.json')).toBeNull();
  });

  it('detects onnx from nested path', () => {
    expect(inferRuntime('onnx/model.onnx')).toBe('onnx');
  });

  it('detects litert from .litertlm extension', () => {
    expect(inferRuntime('model.litertlm')).toBe('litert');
  });
});

describe('inferDataType', () => {
  it('detects fp32 from filename', () => {
    expect(inferDataType('model.onnx')).toBe('fp32');
    expect(inferDataType('model_fp32.onnx')).toBe('fp32');
  });

  it('detects fp16 from filename', () => {
    expect(inferDataType('model_fp16.onnx')).toBe('fp16');
  });

  it('detects int8 from filename', () => {
    expect(inferDataType('model_int8.onnx')).toBe('int8');
    expect(inferDataType('model_quantized.onnx')).toBe('int8');
  });

  it('detects int4 from filename', () => {
    expect(inferDataType('model_int4.onnx')).toBe('int4');
  });

  it('detects q4 from filename', () => {
    expect(inferDataType('model_q4.onnx')).toBe('q4');
    expect(inferDataType('model_q4f16.onnx')).toBe('q4f16');
  });

  it('detects uint8 from filename', () => {
    expect(inferDataType('model_uint8.onnx')).toBe('uint8');
  });

  it('detects bnb4 from filename', () => {
    expect(inferDataType('model_bnb4.onnx')).toBe('bnb4');
  });

  it('defaults to fp32 when no type marker found', () => {
    expect(inferDataType('model.onnx')).toBe('fp32');
    expect(inferDataType('decoder_model.onnx')).toBe('fp32');
  });

  it('handles path prefixes', () => {
    expect(inferDataType('onnx/model_fp16.onnx')).toBe('fp16');
  });
});

describe('parseModelFile', () => {
  it('parses a valid onnx model file', () => {
    const result = parseModelFile('model_fp16.onnx', 164_000_000, 'webnn/mobilenet-v2');
    expect(result).toEqual({
      file_path: 'model_fp16.onnx',
      data_type: 'fp16',
      size_bytes: 164_000_000,
      runtime: 'onnx',
    });
  });

  it('parses a valid tflite model file', () => {
    const result = parseModelFile('mobilenet_v3_small.tflite', 5_200_000, 'litert-community/MobileNet');
    expect(result).toEqual({
      file_path: 'mobilenet_v3_small.tflite',
      data_type: 'fp32',
      size_bytes: 5_200_000,
      runtime: 'litert',
    });
  });

  it('returns null for non-model files', () => {
    expect(parseModelFile('config.json', 1024, 'webnn/model')).toBeNull();
    expect(parseModelFile('README.md', 500, 'webnn/model')).toBeNull();
  });

  it('skips .onnx.data external data files', () => {
    expect(parseModelFile('model.onnx.data', 1_000_000_000, 'webnn/model')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/huggingface/parser.test.ts`
Expected: FAIL — module `$lib/huggingface/parser` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/huggingface/parser.ts`:
```typescript
const MODEL_EXTENSIONS = ['.onnx', '.tflite', '.litertlm'];
const SKIP_SUFFIXES = ['.onnx.data'];

const DATA_TYPE_PATTERNS: [RegExp, string][] = [
  [/[_-]q4f16/, 'q4f16'],
  [/[_-]bnb4/, 'bnb4'],
  [/[_-]uint8/, 'uint8'],
  [/[_-]int4/, 'int4'],
  [/[_-]int8/, 'int8'],
  [/[_-]quantized/, 'int8'],
  [/[_-]fp16/, 'fp16'],
  [/[_-]fp32/, 'fp32'],
  [/[_-]q4(?!f)/, 'q4'],
];

export function inferRuntime(filename: string): 'onnx' | 'litert' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.onnx') && !lower.endsWith('.onnx.data')) return 'onnx';
  if (lower.endsWith('.tflite') || lower.endsWith('.litertlm')) return 'litert';
  return null;
}

export function inferDataType(filename: string): string {
  const basename = filename.split('/').pop() ?? filename;
  const lower = basename.toLowerCase();

  for (const [pattern, dataType] of DATA_TYPE_PATTERNS) {
    if (pattern.test(lower)) return dataType;
  }

  return 'fp32';
}

export interface ParsedFile {
  file_path: string;
  data_type: string;
  size_bytes: number;
  runtime: 'onnx' | 'litert';
}

export function parseModelFile(
  filename: string,
  sizeBytes: number,
  _hfModelId: string
): ParsedFile | null {
  const lower = filename.toLowerCase();

  for (const suffix of SKIP_SUFFIXES) {
    if (lower.endsWith(suffix)) return null;
  }

  const runtime = inferRuntime(filename);
  if (!runtime) return null;

  return {
    file_path: filename,
    data_type: inferDataType(filename),
    size_bytes: sizeBytes,
    runtime,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/huggingface/parser.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/huggingface/parser.ts tests/lib/huggingface/parser.test.ts
git commit -m "feat(hf): add filename parser for runtime and data type inference"
```

---

### Task 4: HuggingFace API Client

**Files:**
- Create: `src/lib/huggingface/client.ts`
- Create: `tests/lib/huggingface/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/huggingface/client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HfClient } from '$lib/huggingface/client';
import type { HfRepoInfo, HfFileInfo } from '$lib/huggingface/types';

const mockFetch = vi.fn();

describe('HfClient', () => {
  let client: HfClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    client = new HfClient();
  });

  describe('listOrgModels', () => {
    it('fetches models for an organization', async () => {
      const mockRepos: HfRepoInfo[] = [
        {
          _id: '1',
          id: 'webnn/mobilenet-v2',
          modelId: 'webnn/mobilenet-v2',
          author: 'webnn',
          pipeline_tag: 'image-classification',
          tags: ['onnx'],
          lastModified: '2026-01-01T00:00:00Z',
          private: false,
          disabled: false,
          downloads: 1000,
          likes: 5,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepos),
      });

      const result = await client.listOrgModels('webnn');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('webnn/mobilenet-v2');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://huggingface.co/api/models?author=webnn&limit=1000',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('throws on non-200 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.listOrgModels('nonexistent')).rejects.toThrow('HF API error: 404');
    });
  });

  describe('listModelFiles', () => {
    it('fetches file listing for a model', async () => {
      const mockFiles: HfFileInfo[] = [
        { rfilename: 'onnx/model_fp16.onnx', size: 164_000_000 },
        { rfilename: 'config.json', size: 1024 },
        { rfilename: 'onnx/model.onnx', size: 328_000_000 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockFiles),
      });

      const result = await client.listModelFiles('webnn/mobilenet-v2');
      expect(result).toHaveLength(3);
      expect(result[0].rfilename).toBe('onnx/model_fp16.onnx');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://huggingface.co/api/models/webnn/mobilenet-v2/tree/main',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/huggingface/client.test.ts`
Expected: FAIL — module `$lib/huggingface/client` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/huggingface/client.ts`:
```typescript
import type { HfRepoInfo, HfFileInfo } from './types';
import { HF_API_BASE } from './orgs';

export class HfClient {
  private timeoutMs: number;

  constructor(timeoutMs = 30_000) {
    this.timeoutMs = timeoutMs;
  }

  async listOrgModels(org: string): Promise<HfRepoInfo[]> {
    const url = `${HF_API_BASE}/models?author=${encodeURIComponent(org)}&limit=1000`;
    const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });

    if (!response.ok) {
      throw new Error(`HF API error: ${response.status}`);
    }

    return response.json();
  }

  async listModelFiles(modelId: string): Promise<HfFileInfo[]> {
    const url = `${HF_API_BASE}/models/${encodeURIComponent(modelId)}/tree/main`;
    const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });

    if (!response.ok) {
      throw new Error(`HF API error: ${response.status}`);
    }

    return response.json();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/huggingface/client.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/huggingface/client.ts tests/lib/huggingface/client.test.ts
git commit -m "feat(hf): add HuggingFace Hub API client"
```

---

### Task 5: Model Discovery (Orchestrator)

**Files:**
- Create: `src/lib/huggingface/discover.ts`
- Create: `tests/lib/huggingface/discover.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/huggingface/discover.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverModels } from '$lib/huggingface/discover';
import type { HfRepoInfo, HfFileInfo, ModelEntry } from '$lib/huggingface/types';

const mockListOrgModels = vi.fn();
const mockListModelFiles = vi.fn();

vi.mock('$lib/huggingface/client', () => ({
  HfClient: vi.fn().mockImplementation(() => ({
    listOrgModels: mockListOrgModels,
    listModelFiles: mockListModelFiles,
  })),
}));

describe('discoverModels', () => {
  beforeEach(() => {
    mockListOrgModels.mockReset();
    mockListModelFiles.mockReset();
  });

  it('discovers models from a single org', async () => {
    mockListOrgModels.mockResolvedValueOnce([
      {
        _id: '1',
        id: 'webnn/mobilenet-v2',
        modelId: 'webnn/mobilenet-v2',
        author: 'webnn',
        pipeline_tag: 'image-classification',
        tags: [],
        lastModified: '2026-01-01T00:00:00Z',
        private: false,
        disabled: false,
        downloads: 100,
        likes: 5,
      } satisfies HfRepoInfo,
    ]);

    mockListModelFiles.mockResolvedValueOnce([
      { rfilename: 'onnx/model_fp16.onnx', size: 164_000_000 } satisfies HfFileInfo,
      { rfilename: 'onnx/model.onnx', size: 328_000_000 } satisfies HfFileInfo,
      { rfilename: 'config.json', size: 1024 } satisfies HfFileInfo,
    ]);

    const results = await discoverModels([{ name: 'webnn', runtime: 'onnx' }]);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      hf_model_id: 'webnn/mobilenet-v2',
      file_path: 'onnx/model_fp16.onnx',
      data_type: 'fp16',
      size_bytes: 164_000_000,
      runtime: 'onnx',
      source_org: 'webnn',
      category: 'image-classification',
    });
    expect(results[1]).toEqual({
      hf_model_id: 'webnn/mobilenet-v2',
      file_path: 'onnx/model.onnx',
      data_type: 'fp32',
      size_bytes: 328_000_000,
      runtime: 'onnx',
      source_org: 'webnn',
      category: 'image-classification',
    });
  });

  it('skips disabled and private repos', async () => {
    mockListOrgModels.mockResolvedValueOnce([
      {
        _id: '1',
        id: 'webnn/private-model',
        modelId: 'webnn/private-model',
        author: 'webnn',
        tags: [],
        lastModified: '2026-01-01T00:00:00Z',
        private: true,
        disabled: false,
        downloads: 0,
        likes: 0,
      } satisfies HfRepoInfo,
      {
        _id: '2',
        id: 'webnn/disabled-model',
        modelId: 'webnn/disabled-model',
        author: 'webnn',
        tags: [],
        lastModified: '2026-01-01T00:00:00Z',
        private: false,
        disabled: true,
        downloads: 0,
        likes: 0,
      } satisfies HfRepoInfo,
    ]);

    const results = await discoverModels([{ name: 'webnn', runtime: 'onnx' }]);
    expect(results).toHaveLength(0);
    expect(mockListModelFiles).not.toHaveBeenCalled();
  });

  it('uses pipeline_tag as category, defaults to uncategorized', async () => {
    mockListOrgModels.mockResolvedValueOnce([
      {
        _id: '1',
        id: 'webnn/no-tag-model',
        modelId: 'webnn/no-tag-model',
        author: 'webnn',
        tags: [],
        lastModified: '2026-01-01T00:00:00Z',
        private: false,
        disabled: false,
        downloads: 0,
        likes: 0,
      } satisfies HfRepoInfo,
    ]);

    mockListModelFiles.mockResolvedValueOnce([
      { rfilename: 'model.onnx', size: 10_000_000 } satisfies HfFileInfo,
    ]);

    const results = await discoverModels([{ name: 'webnn', runtime: 'onnx' }]);
    expect(results[0].category).toBe('uncategorized');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/huggingface/discover.test.ts`
Expected: FAIL — module `$lib/huggingface/discover` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/huggingface/discover.ts`:
```typescript
import { HfClient } from './client';
import { parseModelFile } from './parser';
import type { OrgConfig } from './orgs';
import type { ModelEntry, HfRepoInfo } from './types';

export async function discoverModels(orgs: OrgConfig[]): Promise<ModelEntry[]> {
  const client = new HfClient();
  const entries: ModelEntry[] = [];

  for (const org of orgs) {
    const repos = await client.listOrgModels(org.name);

    const publicRepos = repos.filter((r) => !r.private && !r.disabled);

    for (const repo of publicRepos) {
      const files = await client.listModelFiles(repo.id);
      const category = repo.pipeline_tag ?? 'uncategorized';

      for (const file of files) {
        const parsed = parseModelFile(file.rfilename, file.size, repo.id);
        if (!parsed) continue;

        entries.push({
          hf_model_id: repo.id,
          file_path: parsed.file_path,
          data_type: parsed.data_type,
          size_bytes: parsed.size_bytes,
          runtime: parsed.runtime,
          source_org: org.name,
          category,
        });
      }
    }
  }

  return entries;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/huggingface/discover.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/huggingface/discover.ts tests/lib/huggingface/discover.test.ts
git commit -m "feat(hf): add model discovery orchestrator"
```

---

### Task 6: Database Migration — Add Category Column

**Files:**
- Create: `supabase/migrations/005_models_category.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/005_models_category.sql`:
```sql
alter table public.models add column category text not null default 'uncategorized';
create index idx_models_category on public.models(category);
create index idx_models_data_type on public.models(data_type);
```

- [ ] **Step 2: Update TypeScript types to include category**

In `src/lib/supabase/types.ts`, update the `models` table definition.

Replace the `models` section:
```typescript
      models: {
        Row: {
          id: string;
          hf_model_id: string;
          file_path: string;
          data_type: string;
          size_bytes: number;
          runtime: 'onnx' | 'litert';
          source_org: string;
          category: string;
          last_synced: string;
        };
        Insert: {
          hf_model_id: string;
          file_path: string;
          data_type: string;
          size_bytes: number;
          runtime: 'onnx' | 'litert';
          source_org: string;
          category?: string;
        };
        Update: {
          data_type?: string;
          size_bytes?: number;
          category?: string;
          last_synced?: string;
        };
      };
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_models_category.sql src/lib/supabase/types.ts
git commit -m "feat(db): add category column to models table"
```

---

### Task 7: Supabase Edge Function — Model Sync

**Files:**
- Create: `supabase/functions/sync-models/index.ts`

- [ ] **Step 1: Create the Edge Function**

Create `supabase/functions/sync-models/index.ts`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HF_API_BASE = 'https://huggingface.co/api';

const HF_ORGS = [
  { name: 'Xenova', runtime: 'onnx' },
  { name: 'onnx-community', runtime: 'onnx' },
  { name: 'webnn', runtime: 'onnx' },
  { name: 'webgpu', runtime: 'onnx' },
  { name: 'litert-community', runtime: 'litert' },
] as const;

const MODEL_EXTENSIONS = ['.onnx', '.tflite', '.litertlm'];
const SKIP_SUFFIXES = ['.onnx.data'];

const DATA_TYPE_PATTERNS: [RegExp, string][] = [
  [/[_-]q4f16/, 'q4f16'],
  [/[_-]bnb4/, 'bnb4'],
  [/[_-]uint8/, 'uint8'],
  [/[_-]int4/, 'int4'],
  [/[_-]int8/, 'int8'],
  [/[_-]quantized/, 'int8'],
  [/[_-]fp16/, 'fp16'],
  [/[_-]fp32/, 'fp32'],
  [/[_-]q4(?!f)/, 'q4'],
];

function inferRuntime(filename: string): 'onnx' | 'litert' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.onnx') && !lower.endsWith('.onnx.data')) return 'onnx';
  if (lower.endsWith('.tflite') || lower.endsWith('.litertlm')) return 'litert';
  return null;
}

function inferDataType(filename: string): string {
  const basename = filename.split('/').pop() ?? filename;
  const lower = basename.toLowerCase();
  for (const [pattern, dataType] of DATA_TYPE_PATTERNS) {
    if (pattern.test(lower)) return dataType;
  }
  return 'fp32';
}

interface ModelRow {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  size_bytes: number;
  runtime: string;
  source_org: string;
  category: string;
  last_synced: string;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const rows: ModelRow[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const org of HF_ORGS) {
    try {
      const reposRes = await fetch(
        `${HF_API_BASE}/models?author=${encodeURIComponent(org.name)}&limit=1000`
      );
      if (!reposRes.ok) {
        errors.push(`Failed to list ${org.name}: ${reposRes.status}`);
        continue;
      }

      const repos = await reposRes.json();

      for (const repo of repos) {
        if (repo.private || repo.disabled) continue;

        try {
          const filesRes = await fetch(
            `${HF_API_BASE}/models/${encodeURIComponent(repo.id)}/tree/main`
          );
          if (!filesRes.ok) continue;

          const files = await filesRes.json();
          const category = repo.pipeline_tag ?? 'uncategorized';

          for (const file of files) {
            const lower = file.rfilename.toLowerCase();
            if (SKIP_SUFFIXES.some((s) => lower.endsWith(s))) continue;

            const runtime = inferRuntime(file.rfilename);
            if (!runtime) continue;

            rows.push({
              hf_model_id: repo.id,
              file_path: file.rfilename,
              data_type: inferDataType(file.rfilename),
              size_bytes: file.lfs?.size ?? file.size,
              runtime,
              source_org: org.name,
              category,
              last_synced: now,
            });
          }
        } catch (e) {
          errors.push(`Failed to list files for ${repo.id}: ${e}`);
        }
      }
    } catch (e) {
      errors.push(`Failed to process org ${org.name}: ${e}`);
    }
  }

  let inserted = 0;
  let updated = 0;

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from('models')
      .upsert(batch, { onConflict: 'hf_model_id,file_path', count: 'exact' });

    if (error) {
      errors.push(`Upsert batch ${i} failed: ${error.message}`);
    } else {
      inserted += count ?? batch.length;
    }
  }

  return new Response(
    JSON.stringify({
      synced: rows.length,
      inserted,
      errors: errors.length > 0 ? errors : undefined,
      orgs: HF_ORGS.map((o) => o.name),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/sync-models/index.ts
git commit -m "feat(edge): add sync-models Edge Function for daily HF catalog sync"
```

---

### Task 8: Model Browser — Page Load

**Files:**
- Create: `src/routes/model/+page.ts`

- [ ] **Step 1: Create the client-side load function**

Create `src/routes/model/+page.ts`:
```typescript
import type { PageLoad } from './$types';
import { createClient } from '$lib/supabase/client';

export const load: PageLoad = async () => {
  const supabase = createClient();

  const { data: models, error } = await supabase
    .from('models')
    .select('id, hf_model_id, file_path, data_type, size_bytes, runtime, source_org, category')
    .order('hf_model_id', { ascending: true });

  return {
    models: models ?? [],
    error: error?.message ?? null,
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/model/+page.ts
git commit -m "feat(model): add page load for fetching model catalog"
```

---

### Task 9: Model Browser — Filter Component

**Files:**
- Create: `src/lib/components/ModelFilters.svelte`

- [ ] **Step 1: Create the filter bar component**

Create `src/lib/components/ModelFilters.svelte`:
```svelte
<script lang="ts">
  interface Props {
    runtimes: string[];
    orgs: string[];
    dataTypes: string[];
    categories: string[];
    selectedRuntime: string;
    selectedOrg: string;
    selectedDataType: string;
    selectedCategory: string;
    searchQuery: string;
    onfilter: (filters: {
      runtime: string;
      org: string;
      dataType: string;
      category: string;
      search: string;
    }) => void;
  }

  let {
    runtimes,
    orgs,
    dataTypes,
    categories,
    selectedRuntime = $bindable(''),
    selectedOrg = $bindable(''),
    selectedDataType = $bindable(''),
    selectedCategory = $bindable(''),
    searchQuery = $bindable(''),
    onfilter,
  }: Props = $props();

  function emit() {
    onfilter({
      runtime: selectedRuntime,
      org: selectedOrg,
      dataType: selectedDataType,
      category: selectedCategory,
      search: searchQuery,
    });
  }
</script>

<div class="filters">
  <input
    type="search"
    class="filter-search"
    placeholder="Search models..."
    bind:value={searchQuery}
    oninput={emit}
  />

  <select class="filter-select" bind:value={selectedRuntime} onchange={emit}>
    <option value="">All runtimes</option>
    {#each runtimes as rt}
      <option value={rt}>{rt}</option>
    {/each}
  </select>

  <select class="filter-select" bind:value={selectedOrg} onchange={emit}>
    <option value="">All orgs</option>
    {#each orgs as org}
      <option value={org}>{org}</option>
    {/each}
  </select>

  <select class="filter-select" bind:value={selectedDataType} onchange={emit}>
    <option value="">All data types</option>
    {#each dataTypes as dt}
      <option value={dt}>{dt}</option>
    {/each}
  </select>

  <select class="filter-select" bind:value={selectedCategory} onchange={emit}>
    <option value="">All categories</option>
    {#each categories as cat}
      <option value={cat}>{cat}</option>
    {/each}
  </select>
</div>

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .filter-search {
    flex: 1 1 200px;
    min-width: 200px;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color var(--transition-base);
  }

  .filter-search:focus {
    border-color: var(--color-focus-ring);
  }

  .filter-select {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: var(--space-half) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    outline: none;
  }

  .filter-select:focus {
    border-color: var(--color-focus-ring);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/ModelFilters.svelte
git commit -m "feat(ui): add ModelFilters component with search and dropdowns"
```

---

### Task 10: Model Browser — Card Component

**Files:**
- Create: `src/lib/components/ModelCard.svelte`

- [ ] **Step 1: Create the model card component**

Create `src/lib/components/ModelCard.svelte`:
```svelte
<script lang="ts">
  interface Props {
    hfModelId: string;
    filePath: string;
    dataType: string;
    sizeBytes: number;
    runtime: 'onnx' | 'litert';
    sourceOrg: string;
    category: string;
  }

  let { hfModelId, filePath, dataType, sizeBytes, runtime, sourceOrg, category }: Props = $props();

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  const modelName = $derived(hfModelId.split('/').pop() ?? hfModelId);
  const fileName = $derived(filePath.split('/').pop() ?? filePath);
</script>

<div class="card">
  <div class="card-header">
    <span class="model-name" title={hfModelId}>{modelName}</span>
    <span class="org-badge">{sourceOrg}</span>
  </div>

  <div class="card-meta">
    <span class="file-name" title={filePath}>{fileName}</span>
  </div>

  <div class="card-badges">
    <span class="badge badge-runtime" data-runtime={runtime}>{runtime}</span>
    <span class="badge badge-dtype" data-dtype={dataType}>{dataType}</span>
    <span class="badge badge-size">{formatSize(sizeBytes)}</span>
    {#if category !== 'uncategorized'}
      <span class="badge badge-category">{category}</span>
    {/if}
  </div>
</div>

<style>
  .card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-2);
    background: var(--color-surface-raised);
    transition: border-color var(--transition-base);
  }

  .card:hover {
    border-color: var(--color-border-strong);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    margin-bottom: var(--space-half);
  }

  .model-name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .org-badge {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .card-meta {
    margin-bottom: var(--space-1);
  }

  .file-name {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .card-badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-half);
  }

  .badge {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .badge-runtime[data-runtime="onnx"] {
    color: var(--color-runtime-ort);
    border-color: var(--color-runtime-ort);
  }

  .badge-runtime[data-runtime="litert"] {
    color: var(--color-runtime-litert);
    border-color: var(--color-runtime-litert);
  }

  .badge-dtype[data-dtype="fp16"] {
    color: var(--color-dtype-float);
    border-color: var(--color-dtype-float);
  }

  .badge-dtype[data-dtype="int8"],
  .badge-dtype[data-dtype="int4"] {
    color: var(--color-dtype-int);
    border-color: var(--color-dtype-int);
  }

  .badge-dtype[data-dtype="q4"],
  .badge-dtype[data-dtype="q4f16"] {
    color: var(--color-dtype-quant);
    border-color: var(--color-dtype-quant);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/ModelCard.svelte
git commit -m "feat(ui): add ModelCard component with runtime and data type badges"
```

---

### Task 11: Model Browser — Grid Component

**Files:**
- Create: `src/lib/components/ModelGrid.svelte`

- [ ] **Step 1: Create the grid layout component**

Create `src/lib/components/ModelGrid.svelte`:
```svelte
<script lang="ts">
  import ModelCard from './ModelCard.svelte';

  interface Model {
    id: string;
    hf_model_id: string;
    file_path: string;
    data_type: string;
    size_bytes: number;
    runtime: 'onnx' | 'litert';
    source_org: string;
    category: string;
  }

  interface Props {
    models: Model[];
  }

  let { models }: Props = $props();
</script>

{#if models.length === 0}
  <div class="empty">
    <p>No models found matching your filters.</p>
  </div>
{:else}
  <div class="grid">
    {#each models as model (model.id)}
      <ModelCard
        hfModelId={model.hf_model_id}
        filePath={model.file_path}
        dataType={model.data_type}
        sizeBytes={model.size_bytes}
        runtime={model.runtime}
        sourceOrg={model.source_org}
        category={model.category}
      />
    {/each}
  </div>
  <p class="count">{models.length} model{models.length === 1 ? '' : 's'}</p>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-2);
  }

  .empty {
    text-align: center;
    padding: var(--space-5) var(--space-2);
    color: var(--color-text-muted);
  }

  .count {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: right;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/ModelGrid.svelte
git commit -m "feat(ui): add ModelGrid component with responsive layout"
```

---

### Task 12: Model Browser — Page Assembly

**Files:**
- Modify: `src/routes/model/+page.svelte`

- [ ] **Step 1: Replace the stub /model page with the full model browser**

Replace `src/routes/model/+page.svelte`:
```svelte
<script lang="ts">
  import ModelFilters from '$lib/components/ModelFilters.svelte';
  import ModelGrid from '$lib/components/ModelGrid.svelte';

  let { data } = $props();

  let searchQuery = $state('');
  let selectedRuntime = $state('');
  let selectedOrg = $state('');
  let selectedDataType = $state('');
  let selectedCategory = $state('');

  const allModels = $derived(data.models);

  const runtimes = $derived([...new Set(allModels.map((m) => m.runtime))].sort());
  const orgs = $derived([...new Set(allModels.map((m) => m.source_org))].sort());
  const dataTypes = $derived([...new Set(allModels.map((m) => m.data_type))].sort());
  const categories = $derived(
    [...new Set(allModels.map((m) => m.category))].filter((c) => c !== 'uncategorized').sort()
  );

  const filteredModels = $derived(
    allModels.filter((m) => {
      if (selectedRuntime && m.runtime !== selectedRuntime) return false;
      if (selectedOrg && m.source_org !== selectedOrg) return false;
      if (selectedDataType && m.data_type !== selectedDataType) return false;
      if (selectedCategory && m.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesId = m.hf_model_id.toLowerCase().includes(q);
        const matchesFile = m.file_path.toLowerCase().includes(q);
        if (!matchesId && !matchesFile) return false;
      }
      return true;
    })
  );

  function handleFilter(filters: {
    runtime: string;
    org: string;
    dataType: string;
    category: string;
    search: string;
  }) {
    selectedRuntime = filters.runtime;
    selectedOrg = filters.org;
    selectedDataType = filters.dataType;
    selectedCategory = filters.category;
    searchQuery = filters.search;
  }
</script>

<div class="model-page">
  <header class="page-header">
    <h1>Model Browser</h1>
    <p>Select a model to benchmark. All models are sourced from HuggingFace.</p>
  </header>

  {#if data.error}
    <div class="error-banner">
      <p>Failed to load models: {data.error}</p>
    </div>
  {:else}
    <ModelFilters
      {runtimes}
      {orgs}
      {dataTypes}
      {categories}
      bind:selectedRuntime
      bind:selectedOrg
      bind:selectedDataType
      bind:selectedCategory
      bind:searchQuery
      onfilter={handleFilter}
    />

    <ModelGrid models={filteredModels} />
  {/if}
</div>

<style>
  .model-page {
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
    padding: var(--space-2);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-base);
    background: var(--color-surface-sunken);
    color: var(--color-error);
    font-size: var(--text-sm);
  }
</style>
```

- [ ] **Step 2: Verify dev server renders the page**

Run: `npm run dev`

Open browser at `http://localhost:5173/model`. Expected:
- Page header "Model Browser" with description
- Filter bar (search, runtime, org, data type, category dropdowns)
- If no Supabase configured yet: error banner or empty state "No models found"
- If Supabase configured and synced: model cards in a responsive grid

- [ ] **Step 3: Commit**

```bash
git add src/routes/model/+page.svelte
git commit -m "feat(model): replace stub with full model browser page"
```

---

### Task 13: Smoke Test

**Files:**
- Modify: `tests/smoke.test.ts`

- [ ] **Step 1: Add a basic import test for HF modules**

Append to `tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { inferRuntime, inferDataType, parseModelFile } from '$lib/huggingface/parser';
import { HfClient } from '$lib/huggingface/client';
import { HF_ORGS } from '$lib/huggingface/orgs';
import { discoverModels } from '$lib/huggingface/discover';

describe('Phase 2: HuggingFace Integration smoke test', () => {
  it('exports HF_ORGS with 5 organizations', () => {
    expect(HF_ORGS).toHaveLength(5);
  });

  it('HfClient is instantiable', () => {
    const client = new HfClient();
    expect(client).toBeDefined();
  });

  it('parser handles common model filenames', () => {
    expect(inferRuntime('model.onnx')).toBe('onnx');
    expect(inferRuntime('model.tflite')).toBe('litert');
    expect(inferDataType('model_fp16.onnx')).toBe('fp16');
  });

  it('discoverModels is callable', () => {
    expect(typeof discoverModels).toBe('function');
  });
});
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test`
Expected: All tests PASS (roles, benchmark-guard, theme, parser, client, discover, smoke).

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.test.ts
git commit -m "test: add Phase 2 HuggingFace integration smoke tests"
```

---

### Task 14: Update .env.example and Add Sync Script

**Files:**
- Modify: `.env.example`
- Modify: `package.json`

- [ ] **Step 1: Add service role key to .env.example**

Replace `.env.example`:
```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Only needed for running sync-models locally or deploying Edge Functions
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 2: Add sync script to package.json**

Add to the `"scripts"` section of `package.json`:
```json
"sync:models": "npx supabase functions invoke sync-models --no-verify-jwt"
```

- [ ] **Step 3: Commit**

```bash
git add .env.example package.json
git commit -m "chore: update env example and add sync:models script"
```

---

## Phase 2 Summary

After completing all 14 tasks, the project will have:
- HuggingFace API client that lists repos and files from configured organizations
- Filename parser that extracts runtime (onnx/litert) and data type (fp32, fp16, int8, etc.)
- Model discovery orchestrator that walks orgs → repos → files → model entries
- Supabase Edge Function for daily sync (upserts discovered models into the `models` table)
- Category column added to models table with migration
- Full model browser UI on `/model` with search, runtime/org/data type/category filters
- Responsive card grid showing model metadata and color-coded badges
- 20+ unit tests covering parser, client, and discovery logic

## Deployment Steps (after implementation)

1. Run migration `005_models_category.sql` against Supabase
2. Deploy Edge Function: `npx supabase functions deploy sync-models`
3. Trigger initial sync: `npm run sync:models`
4. Set up Supabase cron (pg_cron) for daily execution:
   ```sql
   select cron.schedule(
     'daily-model-sync',
     '0 2 * * *',
     $$select net.http_post(
       url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-models',
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
     );$$
   );
   ```

## What Comes Next

- **Phase 3: Benchmark Engine** — Runtime loading, input extraction, inference runner, metric collection, incremental results with crash recovery
