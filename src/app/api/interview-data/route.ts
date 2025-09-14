import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Get all interview events for this session
    const { data: events, error: eventsError } = await supabase
      .from('interview_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })

    if (eventsError) {
      console.error('Events query error:', eventsError)
      return NextResponse.json({ error: 'Failed to fetch interview events' }, { status: 500 })
    }

    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError) {
      console.error('Session query error:', sessionError)
      return NextResponse.json({ error: 'Failed to fetch session data' }, { status: 500 })
    }

    // Organize data by type
    const questions = events.filter(e => e.event_type === 'question')
    const answers = events.filter(e => e.event_type === 'answer')
    const scores = events.filter(e => e.event_type === 'score')
    const completion = events.find(e => e.event_type === 'completion')

    // Pair questions with answers and scores
    const questionAnswerPairs = questions.map((question, index) => {
      const answer = answers[index]
      const score = scores[index]
      return {
        questionNumber: index + 1,
        question: question.content,
        questionTime: question.timestamp,
        answer: answer?.transcript || answer?.content,
        answerTime: answer?.timestamp,
        score: score?.score,
        scoreReasoning: score?.content,
        scoreTime: score?.timestamp
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        sessionInfo: {
          id: session.id,
          status: session.status,
          candidateName: session.candidate_name,
          interviewScore: session.interview_score,
          excelScore: session.excel_score,
          totalScore: session.total_score,
          startedAt: session.created_at,
          endedAt: session.ended_at
        },
        questionAnswerPairs,
        completion: completion ? {
          content: completion.content,
          timestamp: completion.timestamp
        } : null,
        rawEvents: events.length,
        summary: {
          totalQuestions: questions.length,
          totalAnswers: answers.length,
          totalScores: scores.length,
          averageScore: scores.length > 0 ? 
            scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length : 0
        }
      }
    })

  } catch (error) {
    console.error('Interview data API error:', error)
    return NextResponse.json({ error: 'Failed to fetch interview data' }, { status: 500 })
  }
}