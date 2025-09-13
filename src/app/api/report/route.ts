import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Get interview events for summary
    const { data: interviewEvents } = await supabase
      .from('interview_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })

    // Get Excel tasks for summary
    const { data: excelTasks } = await supabase
      .from('excel_tasks')
      .select('*')
      .eq('session_id', sessionId)

    // Get proctoring events for summary
    const { data: proctoringEvents } = await supabase
      .from('proctoring_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })

    // Generate summaries
    const interviewSummary = generateInterviewSummary(interviewEvents || [])
    const excelSummary = generateExcelSummary(excelTasks || [])
    const proctoringSummary = generateProcotoringSummary(proctoringEvents || [])

    // Calculate overall score (weighted)
    const interviewWeight = 0.6 // 60%
    const excelWeight = 0.4 // 40%
    
    const interviewScore = session.interview_score || 0
    const excelScore = session.excel_score || 0
    
    const maxInterviewScore = (interviewEvents?.filter(e => e.event_type === 'score').length || 1) * 10
    const maxExcelScore = (excelTasks?.length || 1) * 10
    
    const normalizedInterviewScore = (interviewScore / maxInterviewScore) * 100
    const normalizedExcelScore = (excelScore / maxExcelScore) * 100
    
    const overallScore = Math.round(
      (normalizedInterviewScore * interviewWeight) + (normalizedExcelScore * excelWeight)
    )

    // Generate recommendation
    const recommendation = generateRecommendation(overallScore, session.proctoring_flags || 0)

    // Compile report data
    const reportData = {
      session: {
        id: session.id,
        candidateName: session.candidate_name,
        candidateEmail: session.candidate_email,
        duration: session.ended_at ? 
          Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000 / 60) : 
          null
      },
      scores: {
        overall: overallScore,
        interview: {
          raw: interviewScore,
          max: maxInterviewScore,
          percentage: Math.round(normalizedInterviewScore)
        },
        excel: {
          raw: excelScore,
          max: maxExcelScore,
          percentage: Math.round(normalizedExcelScore)
        }
      },
      proctoring: {
        totalFlags: session.proctoring_flags || 0,
        flagTypes: proctoringEvents?.reduce((acc, event) => {
          acc[event.event_type] = (acc[event.event_type] || 0) + 1
          return acc
        }, {} as Record<string, number>) || {}
      },
      details: {
        interviewEvents: interviewEvents?.length || 0,
        excelTasks: excelTasks?.length || 0,
        proctoringEvents: proctoringEvents?.length || 0
      }
    }

    // Save report
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        session_id: sessionId,
        interview_summary: interviewSummary,
        excel_summary: excelSummary,
        proctoring_summary: proctoringSummary,
        overall_score: overallScore,
        recommendation: recommendation,
        report_data: reportData
      })
      .select()
      .single()

    if (reportError) {
      console.error('Failed to save report:', reportError)
      return NextResponse.json({ error: 'Failed to save report' }, { status: 500 })
    }

    // Mark session as completed
    await supabase
      .from('sessions')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        total_score: overallScore
      })
      .eq('id', sessionId)

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        overallScore,
        recommendation,
        reportData,
        summaries: {
          interview: interviewSummary,
          excel: excelSummary,
          proctoring: proctoringSummary
        }
      }
    })

  } catch (error) {
    console.error('Report generation error:', error)
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 })
  }
}

function generateInterviewSummary(events: any[]): string {
  const questions = events.filter(e => e.event_type === 'question').length
  const answers = events.filter(e => e.event_type === 'answer').length
  const scores = events.filter(e => e.event_type === 'score')
  
  const avgScore = scores.length > 0 
    ? Math.round(scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length * 10) / 10
    : 0

  return `Completed ${questions} questions with ${answers} recorded answers. Average score: ${avgScore}/10. ${
    avgScore >= 7 ? 'Strong conceptual understanding demonstrated.' :
    avgScore >= 5 ? 'Moderate understanding with room for improvement.' :
    'Needs significant improvement in Excel concepts.'
  }`
}

function generateExcelSummary(tasks: any[]): string {
  const completed = tasks.length
  const correct = tasks.filter(t => t.is_correct).length
  const totalScore = tasks.reduce((sum, t) => sum + (t.score || 0), 0)
  
  return `Completed ${completed} practical tasks. ${correct}/${completed} were correct. Total Excel score: ${totalScore}/${completed * 10}. ${
    correct === completed ? 'Excellent practical Excel skills.' :
    correct > completed / 2 ? 'Good practical skills with minor gaps.' :
    'Significant improvement needed in Excel formula usage.'
  }`
}

function generateProcotoringSummary(events: any[]): string {
  const totalEvents = events.length
  const faceIssues = events.filter(e => e.event_type === 'face_lost').length
  const tabSwitches = events.filter(e => e.event_type === 'tab_switch').length
  const windowBlurs = events.filter(e => e.event_type === 'window_blur').length

  if (totalEvents === 0) {
    return 'No proctoring issues detected. Candidate maintained proper focus throughout.'
  }

  return `${totalEvents} proctoring events logged: ${faceIssues} face detection issues, ${tabSwitches} tab switches, ${windowBlurs} window focus changes. ${
    totalEvents < 3 ? 'Minor proctoring concerns.' :
    totalEvents < 8 ? 'Moderate proctoring flags - may require review.' :
    'Significant proctoring concerns - manual review recommended.'
  }`
}

function generateRecommendation(overallScore: number, proctoringFlags: number): string {
  let recommendation = ''
  
  // Base recommendation on score
  if (overallScore >= 80) {
    recommendation = 'STRONG HIRE: Excellent Excel skills and conceptual understanding.'
  } else if (overallScore >= 65) {
    recommendation = 'HIRE: Good Excel skills with minor areas for development.'
  } else if (overallScore >= 50) {
    recommendation = 'CONSIDER: Moderate skills, may need training or specific role fit.'
  } else {
    recommendation = 'NOT RECOMMENDED: Significant gaps in Excel knowledge and skills.'
  }

  // Adjust for proctoring flags
  if (proctoringFlags > 5) {
    recommendation += ' NOTE: Multiple proctoring flags require manual review of integrity.'
  } else if (proctoringFlags > 2) {
    recommendation += ' NOTE: Some proctoring flags noted but within acceptable range.'
  }

  return recommendation
}