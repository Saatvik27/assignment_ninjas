import { NextRequest, NextResponse } from 'next/server'
// import { scoreAndGenerateFollowup, generateInterviewQuestion } from '@/lib/groq' // Groq doesn't support Gemini - commented out
import { scoreAndGenerateFollowup, generateInterviewQuestion } from '@/lib/gemini' // Back to direct Gemini
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    // Check if request has content
    const contentLength = request.headers.get('content-length')
    if (!contentLength || contentLength === '0') {
      console.error('Empty request received')
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 })
    }

    const body = await request.json()
    console.log('Interview API received:', body)
    
    const { sessionId, transcript, questionContext, action } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    if (action === 'generate_question') {
      // Generate a new interview question
      const { questionNumber = 1, difficulty = 'intermediate' } = body
      
      const question = await generateInterviewQuestion(questionNumber, difficulty)
      
      // Save question to database
      const { data, error } = await supabase
        .from('interview_events')
        .insert({
          session_id: sessionId,
          event_type: 'question',
          content: question
        })
        .select()
        .single()

      if (error) {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to save question' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        question,
        eventId: data.id
      })
    }

    if (action === 'score_answer') {
      // Score transcript and generate follow-up
      if (!transcript || !questionContext) {
        return NextResponse.json({ error: 'Transcript and question context are required' }, { status: 400 })
      }

      // Get previous conversation for context
      const { data: previousEvents } = await supabase
        .from('interview_events')
        .select('event_type, content, transcript')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true })

      const conversationHistory = previousEvents
        ?.map(event => `${event.event_type}: ${event.content || event.transcript}`)
        .join('\n') || ''

      const result = await scoreAndGenerateFollowup(transcript, questionContext, conversationHistory)

      // Save score and follow-up question
      const { data: scoreEvent, error: scoreError } = await supabase
        .from('interview_events')
        .insert({
          session_id: sessionId,
          event_type: 'score',
          content: result.reasoning,
          score: result.score
        })
        .select()
        .single()

      if (scoreError) {
        console.error('Score save error:', scoreError)
      }

      const { data: followupEvent, error: followupError } = await supabase
        .from('interview_events')
        .insert({
          session_id: sessionId,
          event_type: 'follow_up',
          content: result.followupQuestion
        })
        .select()
        .single()

      if (followupError) {
        console.error('Follow-up save error:', followupError)
      }

      // Update session score
      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          interview_score: result.score,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)

      if (updateError) {
        console.error('Session update error:', updateError)
      }

      return NextResponse.json({
        success: true,
        score: result.score,
        reasoning: result.reasoning,
        followupQuestion: result.followupQuestion,
        scoreEventId: scoreEvent?.id,
        followupEventId: followupEvent?.id
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Interview API error:', error)
    return NextResponse.json({ error: 'Interview processing failed' }, { status: 500 })
  }
}