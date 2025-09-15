import { NextRequest, NextResponse } from 'next/server'
import { scoreAndGenerateFollowup as groqScoreAndFollowup, generateInterviewQuestion as groqGenerateQuestion } from '@/lib/groq' // Groq primary
import { scoreAndGenerateFollowup as geminiScoreAndFollowup, generateInterviewQuestion as geminiGenerateQuestion } from '@/lib/gemini' // Gemini fallback
import { createServerSupabaseClient } from '@/lib/supabase'

interface ScoringResult {
  score: number
  reasoning: string
  followupQuestion: string
}

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
      // Generate a new interview question - try Gemini first, fallback if needed
      const { questionNumber = 1, difficulty = 'intermediate' } = body
      
      // Get previously asked questions to avoid duplicates
      const { data: previousQuestions, error: queryError } = await supabase
        .from('interview_events')
        .select('content')
        .eq('session_id', sessionId)
        .eq('event_type', 'question')
        .order('created_at', { ascending: true })
      
      const previousQuestionTexts = previousQuestions?.map(q => q.content) || []
      
      // Try Groq first (fast and reliable), then Gemini as fallback
      console.log(`🚀 Attempting Groq (Llama) generation for Question ${questionNumber}...`)
      
      let questionGenerated = false
      let generatedQuestion = ''
      
      try {
        const groqQuestion = await groqGenerateQuestion(questionNumber, difficulty)
        
        if (groqQuestion && groqQuestion.trim()) {
          console.log(`✅ Groq success! Generated Question ${questionNumber}:`, groqQuestion.substring(0, 100) + '...')
          generatedQuestion = groqQuestion
          questionGenerated = true
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Groq failed for Question ${questionNumber}:`, errorMessage)
      }
      
      // Fallback to Gemini if Groq fails
      if (!questionGenerated) {
        console.log(`🤖 Fallback to Gemini generation for Question ${questionNumber}...`)
        
        try {
          const geminiQuestion = await geminiGenerateQuestion(questionNumber, difficulty, previousQuestionTexts)
          
          if (geminiQuestion && geminiQuestion.trim()) {
            console.log(`✅ Gemini fallback success! Generated Question ${questionNumber}:`, geminiQuestion.substring(0, 100) + '...')
            generatedQuestion = geminiQuestion
            questionGenerated = true
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error(`❌ Gemini also failed for Question ${questionNumber}:`, errorMessage)
        }
      }
      
      // Save AI-generated question to database
      if (questionGenerated) {
        const { data, error } = await supabase
          .from('interview_events')
          .insert({
            session_id: sessionId,
            event_type: 'question',
            content: generatedQuestion
          })
          .select()
          .single()

        if (error) {
          console.error('Database error saving AI question:', error)
        } else {
          return NextResponse.json({
            success: true,
            question: generatedQuestion,
            eventId: data.id,
            source: questionGenerated ? 'ai' : 'fallback'
          })
        }
      }
      
      // Fallback questions (only if Gemini fails)
      console.log(`⚠️ Using fallback for Question ${questionNumber}`)
      const fallbackQuestions: Record<string, string[]> = {
        beginner: [
          'What is the difference between a cell and a range in Excel?',
          'Explain what a formula is and how it differs from regular text.',
          'What does the SUM function do in Excel?'
        ],
        intermediate: [
          'What is the difference between VLOOKUP and INDEX-MATCH functions?',
          'Explain how PivotTables help in data analysis.',
          'What are the advantages of using absolute vs relative cell references?'
        ],
        advanced: [
          'How does Excel handle circular references and how can they be resolved?',
          'Explain the difference between volatile and non-volatile functions in Excel.',
          'What are array formulas and when would you use them?'
        ]
      }
      
      const questions = fallbackQuestions[difficulty] || fallbackQuestions.intermediate
      const fallbackQuestion = questions[Math.min(questionNumber - 1, questions.length - 1)] || questions[0]

      // Save fallback question to database
      const { data, error } = await supabase
        .from('interview_events')
        .insert({
          session_id: sessionId,
          event_type: 'question',
          content: fallbackQuestion
        })
        .select()
        .single()

      if (error) {
        console.error('Database error saving fallback question:', error)
        return NextResponse.json({ error: 'Failed to save question' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        question: fallbackQuestion,
        eventId: data.id,
        source: 'fallback'
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

      // Try Groq first for scoring, then Gemini as fallback
      console.log(`🚀 Attempting Groq (Llama) scoring...`)
      
      let scoringResult: ScoringResult | null = null
      
      try {
        const groqResult = await groqScoreAndFollowup(transcript, questionContext, conversationHistory)
        
        if (groqResult && groqResult.score !== undefined) {
          console.log(`✅ Groq scoring success! Score: ${groqResult.score}`)
          scoringResult = groqResult
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Groq scoring failed:`, errorMessage)
      }
      
      // Fallback to Gemini if Groq fails
      if (!scoringResult) {
        console.log(`🤖 Fallback to Gemini scoring...`)
        
        try {
          const geminiResult = await geminiScoreAndFollowup(transcript, questionContext, conversationHistory)
          
          if (geminiResult && geminiResult.score !== undefined) {
            console.log(`✅ Gemini scoring success! Score: ${geminiResult.score}`)
            scoringResult = geminiResult
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error(`❌ Gemini scoring also failed:`, errorMessage)
        }
      }
      
      // Use AI result or fallback
      const finalResult = scoringResult || {
        score: 3,
        reasoning: 'Answer received and is being analyzed. Thank you for your response.',
        followupQuestion: 'Let\'s continue with the next question.'
      }

      // Save score and follow-up question 
      const { data: scoreEvent, error: scoreError } = await supabase
        .from('interview_events')
        .insert({
          session_id: sessionId,
          event_type: 'score',
          content: finalResult.reasoning,
          score: finalResult.score
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
          content: finalResult.followupQuestion
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
      const scaledScore = Math.round(finalResult.score * 0.5) // Convert 10-point to 5-point scale
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
        originalScore: finalResult.score, // Keep original for reference
        reasoning: finalResult.reasoning,
        followupQuestion: finalResult.followupQuestion,
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