import type { PageLoad } from './$types';

export interface ModelRow {
  id: string;
  hf_model_id: string;
  file_path: string;
  data_type: string;
  size_bytes: number;
  runtime: 'onnx' | 'litert';
  source_org: string;
  task: string;
  last_synced: string;
}

export const load: PageLoad = ({ url }) => {
  return {
    initialSearch: url.searchParams.get('q') ?? '',
  };
};
