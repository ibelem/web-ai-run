export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
          display_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          role?: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
          display_name?: string | null;
          avatar_url?: string | null;
        };
      };
      recipes: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          visibility: 'personal' | 'public';
          models: RecipeModel[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          name: string;
          slug: string;
          visibility?: 'personal' | 'public';
          models: RecipeModel[];
        };
        Update: {
          name?: string;
          slug?: string;
          visibility?: 'personal' | 'public';
          models?: RecipeModel[];
        };
      };
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
      results: {
        Row: {
          id: string;
          run_id: string | null;
          user_id: string;
          model_id: string;
          backend: string;
          data_type: string;
          status: 'running' | 'completed' | 'timeout' | 'crashed' | 'error';
          timeout_phase: 'download' | 'compilation' | 'inference' | null;
          error_message: string | null;
          cpu: string;
          gpu: string;
          os: string;
          os_version: string;
          browser: string;
          browser_version: string;
          metrics: BenchmarkMetrics | null;
          iterations: number;
          iterations_completed: number;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          run_id?: string | null;
          user_id: string;
          model_id: string;
          backend: string;
          data_type: string;
          status?: 'running' | 'completed' | 'timeout' | 'crashed' | 'error';
          cpu: string;
          gpu: string;
          os: string;
          os_version: string;
          browser: string;
          browser_version: string;
          metrics?: BenchmarkMetrics | null;
          iterations: number;
          iterations_completed?: number;
        };
        Update: {
          status?: 'running' | 'completed' | 'timeout' | 'crashed' | 'error';
          timeout_phase?: 'download' | 'compilation' | 'inference' | null;
          error_message?: string | null;
          metrics?: BenchmarkMetrics | null;
          iterations_completed?: number;
          completed_at?: string;
        };
      };
    };
  };
}

export interface RecipeModel {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  backends: string[];
}

export interface BenchmarkMetrics {
  compilation_ms: number;
  first_inference_ms: number;
  time_to_first_ms: number;
  average_ms: number;
  median_ms: number;
  best_ms: number;
  p90_ms: number;
  throughput_fps: number;
}
