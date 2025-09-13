import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client (with anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase client (with service role key) - use only in API routes
export const createServerSupabaseClient = () => {
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

// Types for our database tables
export interface Session {
  id: string
  candidate_name?: string
  candidate_email?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  started_at: string
  ended_at?: string
  total_score: number
  interview_score: number
  excel_score: number
  proctoring_flags: number
  created_at: string
  updated_at: string
}

export interface InterviewEvent {
  id: string
  session_id: string
  event_type: 'question' | 'answer' | 'score' | 'follow_up'
  content?: string
  transcript?: string
  audio_url?: string
  score?: number
  timestamp: string
}

export interface ExcelTask {
  id: string
  session_id: string
  task_description?: string
  expected_formula?: string
  candidate_formula?: string
  is_correct: boolean
  score: number
  cell_reference?: string
  created_at: string
}

export interface ProctoringEvent {
  id: string
  session_id: string
  event_type: 'face_detected' | 'face_lost' | 'tab_switch' | 'window_blur' | 'fullscreen_exit'
  confidence?: number
  metadata?: any
  timestamp: string
}

export interface Report {
  id: string
  session_id: string
  interview_summary?: string
  excel_summary?: string
  proctoring_summary?: string
  overall_score?: number
  recommendation?: string
  report_data?: any
  created_at: string
}