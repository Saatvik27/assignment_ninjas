-- Migration to update existing proctoring_events table to support new event types
-- Run this in your Supabase SQL editor

-- Step 1: Drop the existing CHECK constraint
ALTER TABLE proctoring_events DROP CONSTRAINT IF EXISTS proctoring_events_event_type_check;

-- Step 2: Add the updated CHECK constraint with all new event types
ALTER TABLE proctoring_events 
ADD CONSTRAINT proctoring_events_event_type_check 
CHECK (event_type IN (
  'face_detected', 'face_lost',
  'tab_switch', 'tab_switch_away', 'tab_switch_back', 'tab_return',
  'window_blur', 'window_focus', 
  'fullscreen_exit', 'screen_share_stopped',
  'suspicious_key_combo', 'mouse_leave', 'mouse_enter',
  'audio_transcript'
));

-- Step 3: Add indexes for better performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_proctoring_events_session_id ON proctoring_events(session_id);
CREATE INDEX IF NOT EXISTS idx_proctoring_events_event_type ON proctoring_events(event_type);
CREATE INDEX IF NOT EXISTS idx_proctoring_events_timestamp ON proctoring_events(timestamp);

-- Verification query - run this to confirm the constraint was updated
SELECT conname, consrc 
FROM pg_constraint 
WHERE conname = 'proctoring_events_event_type_check';