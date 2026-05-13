import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
  const modelIds = url.searchParams.get('models')?.split(',').filter(Boolean) ?? [];

  return { modelIds };
};
