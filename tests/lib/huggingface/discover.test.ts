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
