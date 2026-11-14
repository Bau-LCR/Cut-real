export type Role = 'user' | 'admin' | 'owner'
export type MsgStatus = 'generating' | 'done' | 'error' | 'cancelled' | 'interrupted'
export interface Source { title: string; url: string; snippet: string }
export interface Conversation { id: string; title: string; model_id: string | null; pinned: boolean; created_at: string; updated_at: string; last_message_at: string }
export interface Message {
  id: string; seq?: number; conversation_id: string; role: 'user' | 'assistant' | 'system'; content: string; status: MsgStatus
  model_id: string | null; error: string | null; sources: Source[]; web_search_used: boolean; created_at: string; updated_at: string
}
export interface ModelInfo { id: string; model_key: string; display_name: string; supports_vision: boolean; context_window: number | null; provider_slug: string; provider_name: string; sort_order: number }
export interface Attachment {
  id: string; conversation_id: string | null; message_id: string | null; storage_path: string; file_name: string; mime_type: string
  size_bytes: number; status: 'processed' | 'attached_only' | 'failed'
}
export interface VoiceSettings { rate: number; auto_read: boolean; engine: 'browser' | 'remote'; voice_uri?: string }
export interface Me { userId: string; email: string | null; display_name: string | null; avatar_url: string | null; role: Role; suspended: boolean }
