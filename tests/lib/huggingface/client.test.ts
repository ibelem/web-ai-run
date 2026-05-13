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
