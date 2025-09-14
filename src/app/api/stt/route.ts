import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type')
    
    let sessionId: string
    let transcript: string
    let useWebSpeech: string = 'true'

    if (contentType?.includes('application/json')) {
      // Handle JSON requests from TimedAudioRecorder
      const body = await request.json()
      sessionId = body.sessionId
      transcript = body.transcript || 'No speech detected'
    } else if (contentType?.includes('multipart/form-data') || contentType?.includes('application/x-www-form-urlencoded')) {
      // Handle FormData requests (legacy support)
      const formData = await request.formData()
      const audioFile = formData.get('audio') as File
      sessionId = formData.get('sessionId') as string
      useWebSpeech = formData.get('useWebSpeech') as string

      if (!audioFile) {
        return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
      }

      // Since we're using Web Speech API (browser-based), process the transcript directly
      if (useWebSpeech === 'true') {
        // For Web Speech API, the 'audio' field contains the transcript text
        const transcriptText = await audioFile.text()
        transcript = transcriptText || 'No speech detected'
      } else {
        // Fallback message if somehow Web Speech API is not being used
        transcript = "Please use the microphone button to record your answer with speech recognition."
      }
    } else {
      return NextResponse.json({ error: 'Invalid content type. Expected JSON or FormData.' }, { status: 400 })
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
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