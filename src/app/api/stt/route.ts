import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const sessionId = formData.get('sessionId') as string
    const useWebSpeech = formData.get('useWebSpeech') as string

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    let transcript: string

    // Since we're using Web Speech API (browser-based), process the transcript directly
    if (useWebSpeech === 'true') {
      // For Web Speech API, the 'audio' field contains the transcript text
      const transcriptText = await audioFile.text()
      transcript = transcriptText || 'No speech detected'
    } else {
      // Fallback message if somehow Web Speech API is not being used
      transcript = "Please use the microphone button to record your answer with speech recognition."
    }

    if (!transcript.trim()) {
      return NextResponse.json({ error: 'No speech detected' }, { status: 400 })
    }

    // Save transcript to database
    const supabase = createServerSupabaseClient()
    
    const { data, error } = await supabase
      .from('interview_events')
      .insert({
        session_id: sessionId,
        event_type: 'answer',
        transcript: transcript,
        content: transcript
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transcript,
      eventId: data.id
    })

  } catch (error) {
    console.error('STT API error:', error)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}