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
          organization: string | null;
          job_title: string | null;
          created_at: string;
          updated_at: string;
          last_sign_in_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          role?: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
          display_name?: string | null;
          avatar_url?: string | null;
          organization?: string | null;
          job_title?: string | null;
        };
        Update: {
          role?: 'anonymous' | 'member' | 'partner' | 'intel' | 'admin';
          display_name?: string | null;
          avatar_url?: string | null;
          organization?: string | null;
          job_title?: string | null;
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
          task: string;
          last_synced: string;
        };
        Insert: {
          hf_model_id: string;
          file_path: string;
          data_type: string;
          size_bytes: number;
          runtime: 'onnx' | 'litert';
          source_org: string;
          task?: string;
        };
        Update: {
          data_type?: string;
          size_bytes?: number;
          task?: string;
          last_synced?: string;
        };
      };
      shared_configs: {
        Row: {
          id: string;
          owner_id: string;
          config: SharedRunConfig;
          created_at: string;
        };
        Insert: {
          id: string;
          owner_id: string;
          config: SharedRunConfig;
        };
        Update: never;
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
      conversations: {
        Row: {
          id: string;
          user_id: string;
          category: 'bug' | 'feature' | 'howto' | 'other';
          subject: string | null;
          status: 'open' | 'resolved';
          is_public: boolean;
          assigned_to: string | null;
          last_message_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          category: 'bug' | 'feature' | 'howto' | 'other';
          subject?: string | null;
          status?: 'open' | 'resolved';
          is_public?: boolean;
          assigned_to?: string | null;
        };
        Update: {
          subject?: string | null;
          status?: 'open' | 'resolved';
          is_public?: boolean;
          assigned_to?: string | null;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          attachments: unknown;
          is_internal: boolean;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          sender_id: string;
          body: string;
          attachments?: unknown;
          is_internal?: boolean;
        };
        Update: {
          body?: string;
          attachments?: unknown;
          is_internal?: boolean;
        };
      };
      conversation_reads: {
        Row: {
          conversation_id: string;
          user_id: string;
          last_read_at: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          last_read_at?: string;
        };
        Update: {
          last_read_at?: string;
        };
      };
      account_events: {
        Row: {
          id: number;
          user_id: string;
          event_type: 'sign_in' | 'role_changed' | 'result_uploaded' | 'result_deleted' | 'recipe_deleted';
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          event_type: 'sign_in';
        };
        Update: never;
      };
    };
  };
}

export interface RecipeModel {
  hf_model_id: string;
  file_path: string;
  data_type: string;
  size_bytes?: number;
}

export interface SharedRunConfig {
  models: { hf_model_id: string; file_path: string }[];
  backends: string[];
  iterations: number;
  upload?: boolean;
  cpu?: string;
  os?: string;
  ort?: string;
  litert?: string;
  webnn_ep?: string;
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
