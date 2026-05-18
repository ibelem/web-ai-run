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
  task: string;
}

export interface SyncResult {
  inserted: number;
  updated: number;
  errors: string[];
}
