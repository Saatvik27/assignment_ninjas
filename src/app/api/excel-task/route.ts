import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// Enhanced formula evaluation function
function evaluateExcelFormula(userFormula: string, expectedFormula: string, taskDescription: string): {
  isCorrect: boolean,
  score: number,
  feedback: string
} {
  const cleanUserFormula = userFormula.replace(/^=/, '').trim().toUpperCase()
  const cleanExpectedFormula = expectedFormula.toUpperCase()
  
  // Exact match - full points
  if (cleanUserFormula === cleanExpectedFormula) {
    return {
      isCorrect: true,
      score: 10,
      feedback: '🎉 Perfect! Your formula is exactly correct.'
    }
  }
  
  // Function-based scoring
  const userFunctions = extractFunctions(cleanUserFormula)
  const expectedFunctions = extractFunctions(cleanExpectedFormula)
  
  let score = 0
  let feedback = ''
  let isCorrect = false
  
  // Check if main function is correct
  if (userFunctions.main === expectedFunctions.main) {
    score += 4 // 40% for correct function
    feedback = `✅ Great! You used the correct function (${expectedFunctions.main}).`
  } else {
    feedback = `❌ You need to use the ${expectedFunctions.main} function for this task.`
  }
  
  // Check parameters and syntax
  if (checkSyntaxPatterns(cleanUserFormula, cleanExpectedFormula)) {
    score += 3 // 30% for correct syntax patterns
    feedback += ' The syntax looks good.'
  } else {
    feedback += ' Check your parameters and syntax.'
  }
  
  // Check for common alternative solutions
  const alternativeScore = checkAlternativeSolutions(cleanUserFormula, expectedFunctions.main, taskDescription)
  score += alternativeScore
  
  if (alternativeScore > 0) {
    feedback += ' Your approach shows good Excel knowledge.'
  }
  
  // Bonus points for advanced techniques
  if (hasAdvancedTechniques(cleanUserFormula)) {
    score += 1
    feedback += ' 🌟 Nice use of advanced Excel techniques!'
  }
  
  // Cap at 10 points
  score = Math.min(score, 10)
  isCorrect = score >= 8
  
  if (score >= 8) {
    feedback = '🎉 ' + feedback
  } else if (score >= 5) {
    feedback = '👍 ' + feedback + ' You\'re on the right track!'
  } else {
    feedback = '💡 ' + feedback + ' Review the task requirements and try again.'
  }
  
  return { isCorrect, score, feedback }
}

function extractFunctions(formula: string): { main: string, all: string[] } {
  const functions = formula.match(/\b[A-Z]+(?=\()/g) || []
  return {
    main: functions[0] || '',
    all: functions
  }
}

function checkSyntaxPatterns(userFormula: string, expectedFormula: string): boolean {
  // Remove specific values and check structure
  const userPattern = userFormula.replace(/("[^"]*"|'[^']*'|\b\d+\b)/g, 'VALUE')
  const expectedPattern = expectedFormula.replace(/("[^"]*"|'[^']*'|\b\d+\b)/g, 'VALUE')
  
  return userPattern === expectedPattern
}

function checkAlternativeSolutions(userFormula: string, expectedFunction: string, taskDescription: string): number {
  // Check for valid alternative approaches
  const alternatives: Record<string, string[]> = {
    'SUMIF': ['SUMPRODUCT', 'SUMIFS'],
    'COUNTIF': ['COUNTIFS', 'SUMPRODUCT'],
    'VLOOKUP': ['INDEX', 'XLOOKUP', 'LOOKUP'],
    'AVERAGE': ['SUM', 'COUNT']
  }
  
  if (alternatives[expectedFunction]) {
    for (const alt of alternatives[expectedFunction]) {
      if (userFormula.includes(alt)) {
        return 2 // Partial credit for valid alternative
      }
    }
  }
  
  return 0
}

function hasAdvancedTechniques(formula: string): boolean {
  const advanced = ['INDEX', 'MATCH', 'XLOOKUP', 'SUMPRODUCT', 'INDIRECT', 'OFFSET']
  return advanced.some(func => formula.includes(func))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body
    
    if (action === 'evaluate_formula') {
      const { sessionId, taskId, userFormula, expectedFormula, taskDescription } = body
      
      if (!sessionId || !userFormula) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }
      
      // Evaluate the formula
      const evaluation = evaluateExcelFormula(userFormula, expectedFormula, taskDescription)
      
      return NextResponse.json({
        success: true,
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation.feedback
      })
    }

    // Original save functionality
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