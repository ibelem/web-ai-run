const NPM_API = 'https://registry.npmjs.org';

export interface PackageVersions {
  dev: string[];
  stable: string[];
}

async function fetchNpmVersions(pkg: string): Promise<PackageVersions> {
  const res = await fetch(`${NPM_API}/${encodeURIComponent(pkg)}`);
  if (!res.ok) throw new Error(`npm fetch failed for ${pkg}`);
  const json = await res.json();

  const times: Record<string, string> = json.time ?? {};

  const sorted = Object.keys(json.versions ?? {})
    .filter(v => times[v])
    .sort((a, b) => new Date(times[b]).getTime() - new Date(times[a]).getTime());

  const dev = sorted.filter(v => v.includes('-')).slice(0, 100);
  const stable = sorted.filter(v => !v.includes('-'));

  return { dev, stable };
}

export async function fetchRuntimeVersions(): Promise<{
  ort: PackageVersions;
  litert: PackageVersions;
  transformers: PackageVersions;
}> {
  const [ort, litert, transformers] = await Promise.allSettled([
    fetchNpmVersions('onnxruntime-web'),
    fetchNpmVersions('@litertjs/core'),
    fetchNpmVersions('@huggingface/transformers'),
  ]);
  return {
    ort: ort.status === 'fulfilled' ? ort.value : { dev: ['1.21.0'], stable: ['1.21.0'] },
    litert: litert.status === 'fulfilled' ? litert.value : { dev: ['1.1.0'], stable: ['1.1.0'] },
    transformers: transformers.status === 'fulfilled' ? transformers.value : { dev: ['4.2.0'], stable: ['4.2.0'] },
  };
}
