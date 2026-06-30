export type Category = 'bug' | 'feature' | 'howto' | 'other';
export type ConvStatus = 'open' | 'resolved';

export interface Attachment {
  path: string;   // storage object path within support-attachments bucket
  name: string;
  size: number;   // bytes after compression
  w?: number;
  h?: number;
}

export interface Conversation {
  id: string;
  user_id: string;
  category: Category;
  subject: string | null;
  status: ConvStatus;
  is_public: boolean;
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachments: Attachment[];
  is_internal: boolean;
  created_at: string;
}

export interface ConversationRead {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
}
