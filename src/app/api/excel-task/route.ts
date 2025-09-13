import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sessionId,
      taskId,
      taskDescription,
      expectedFormula,
      candidateFormula,
      isCorrect,
      score,
      cellReference,
      feedback
    } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Save Excel task result
    const { data, error } = await supabase
      .from('excel_tasks')
      .insert({
        session_id: sessionId,
        task_description: taskDescription,
        expected_formula: expectedFormula,
        candidate_formula: candidateFormula,
        is_correct: isCorrect,
        score: score,
        cell_reference: cellReference
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to save task result' }, { status: 500 })
    }

    // Update session Excel score (sum of all Excel task scores)
    const { data: allTasks } = await supabase
      .from('excel_tasks')
      .select('score')
      .eq('session_id', sessionId)

    const totalExcelScore = allTasks?.reduce((sum, task) => sum + (task.score || 0), 0) || 0

    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        excel_score: totalExcelScore,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Session update error:', updateError)
    }

    return NextResponse.json({
      success: true,
      taskId: data.id,
      totalExcelScore
    })

  } catch (error) {
    console.error('Excel task API error:', error)
    return NextResponse.json({ error: 'Excel task processing failed' }, { status: 500 })
  }
}