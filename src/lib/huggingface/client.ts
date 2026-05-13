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
    const url = `${HF_API_BASE}/models/${modelId}/tree/main`;
    const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });

    if (!response.ok) {
      throw new Error(`HF API error: ${response.status}`);
    }

    return response.json();
  }
}
