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
