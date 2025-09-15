-- Interview Sessions Database Schema
-- Run this SQL in your Supabase SQL editor

-- Sessions table - tracks interview sessions
CREATE TABLE sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_name TEXT,
  candidate_email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  total_score INTEGER DEFAULT 0,
  interview_score INTEGER DEFAULT 0,
  excel_score INTEGER DEFAULT 0,
  proctoring_flags INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Interview events - voice Q&A transcripts and responses
CREATE TABLE interview_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  event_type TEXT CHECK (event_type IN ('question', 'answer', 'score', 'follow_up')),
  content TEXT,
  transcript TEXT,
  audio_url TEXT,
  score INTEGER,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Excel tasks and formula evaluations
CREATE TABLE excel_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  task_description TEXT,
  expected_formula TEXT,
  candidate_formula TEXT,
  is_correct BOOLEAN DEFAULT FALSE,
  score INTEGER DEFAULT 0,
  cell_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI-generated Excel tasks
CREATE TABLE ai_excel_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  task_number INTEGER,
  title TEXT,
  description TEXT,
  business_context TEXT,
  sample_data JSONB,
  expected_formula TEXT,
  expected_result TEXT,
  difficulty_level TEXT,
  alternative_solutions JSONB,
  hints JSONB,
  target_cell TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Proctoring events - face detection, tab switches, etc.
CREATE TABLE proctoring_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  event_type TEXT CHECK (event_type IN (
    'face_detected', 'face_lost',
    'tab_switch', 'tab_switch_away', 'tab_switch_back', 'tab_return',
    'window_blur', 'window_focus', 
    'fullscreen_exit', 'screen_share_stopped',
    'suspicious_key_combo', 'mouse_leave', 'mouse_enter',
    'audio_transcript'
  )),
  confidence FLOAT,
  metadata JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Final reports
CREATE TABLE reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  interview_summary TEXT,
  excel_summary TEXT,
  proctoring_summary TEXT,
  overall_score INTEGER,
  recommendation TEXT,
  report_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recordings metadata
CREATE TABLE recordings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  recording_type TEXT CHECK (recording_type IN ('screen', 'audio_chunk')),
  file_path TEXT,
  file_size BIGINT,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE excel_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE proctoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now, restrict later)
CREATE POLICY "Enable all operations for all users" ON sessions FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON interview_events FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON excel_tasks FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON proctoring_events FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON reports FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON recordings FOR ALL USING (true);

-- Create storage bucket for recordings
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false);

-- Storage policy for recordings bucket
CREATE POLICY "Enable all operations for recordings" ON storage.objects FOR ALL USING (bucket_id = 'recordings');