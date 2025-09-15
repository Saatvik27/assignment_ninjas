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
      
      // Get previously asked questions to avoid duplicates
      const { data: previousQuestions, error: queryError } = await supabase
        .from('interview_events')
        .select('content')
        .eq('session_id', sessionId)
        .eq('event_type', 'question')
        .order('created_at', { ascending: true })
      
      const previousQuestionTexts = previousQuestions?.map(q => q.content) || []
      
      const question = await generateInterviewQuestion(questionNumber, difficulty, previousQuestionTexts)
      
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

      // Handle skipped questions
      if (transcript === 'QUESTION_SKIPPED') {
        console.log('Processing skipped question, saving to conversation history')
        
        // Save the skipped question event
        await supabase
          .from('interview_events')
          .insert({
            session_id: sessionId,
            event_type: 'answer',
            content: questionContext,
            transcript: 'SKIPPED',
            score: 0
          })

        return NextResponse.json({
          success: true,
          skipped: true,
          message: 'Question skipped successfully'
        })
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

      // Update session score - get current interview score and add new scaled score
      // Scale from 10-point to 5-point system (Phase 1 now worth 40% = 40 points total)
      const { data: currentSession } = await supabase
        .from('sessions')
        .select('interview_score')
        .eq('id', sessionId)
        .single()

      const currentInterviewScore = currentSession?.interview_score || 0
      const scaledScore = Math.round(result.score * 0.5) // Convert 10-point to 5-point scale
      const newTotalInterviewScore = currentInterviewScore + scaledScore

      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          interview_score: newTotalInterviewScore,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)

      if (updateError) {
        console.error('Session update error:', updateError)
      }

      return NextResponse.json({
        success: true,
        score: scaledScore, // Return the scaled score (5-point system)
        originalScore: result.score, // Keep original for reference
        reasoning: result.reasoning,
        followupQuestion: result.followupQuestion,
        scoreEventId: scoreEvent?.id,
        followupEventId: followupEvent?.id
      })
    }

    if (action === 'complete_interview') {
      // Save interview completion summary
      const { totalScore = 0, questionsAnswered = 0 } = body
      
      // Save completion event as 'follow_up' type (allowed by schema)
      const { data: completionEvent, error: completionError } = await supabase
        .from('interview_events')
        .insert({
          session_id: sessionId,
          event_type: 'follow_up',
          content: `Interview phase completed. Questions answered: ${questionsAnswered}, Total score: ${totalScore}`
        })
        .select()
        .single()

      if (completionError) {
        console.error('Completion save error:', completionError)
      }

      // Update session status to 'in_progress' (Phase 1 done, Phase 2 starting)
      const { error: statusError } = await supabase
        .from('sessions')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)

      if (statusError) {
        console.error('Session status update error:', statusError)
      }

      return NextResponse.json({
        success: true,
        completionEventId: completionEvent?.id
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Interview API error:', error)
    return NextResponse.json({ error: 'Interview processing failed' }, { status: 500 })
  }
}