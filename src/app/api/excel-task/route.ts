import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// Enhanced formula evaluation function - now scaled to 30 points (60% weight)
function evaluateExcelFormula(userFormula: string, expectedFormula: string, taskDescription: string): {
  isCorrect: boolean,
  score: number,
  feedback: string
} {
  // Normalize both formulas for comparison
  const normalizeFormula = (formula: string): string => {
    return formula
      .replace(/^=/, '') // Remove leading =
      .trim() // Remove leading/trailing spaces
      .toUpperCase() // Convert to uppercase
      .replace(/\s+/g, '') // Remove ALL whitespace
  }
  
  const cleanUserFormula = normalizeFormula(userFormula)
  const cleanExpectedFormula = normalizeFormula(expectedFormula)
  
  console.log('Formula comparison:')
  console.log('User formula (normalized):', cleanUserFormula)
  console.log('Expected formula (normalized):', cleanExpectedFormula)
  console.log('Match:', cleanUserFormula === cleanExpectedFormula)
  
  // Exact match - full points (30)
  if (cleanUserFormula === cleanExpectedFormula) {
    return {
      isCorrect: true,
      score: 30,
      feedback: '🎉 Perfect! Your formula is exactly correct.'
    }
  }
  
  // Function-based scoring (scaled to 30 points)
  const userFunctions = extractFunctions(cleanUserFormula)
  const expectedFunctions = extractFunctions(cleanExpectedFormula)
  
  let score = 0
  let feedback = ''
  let isCorrect = false
  
  // Check if main function is correct
  if (userFunctions.main === expectedFunctions.main) {
    score += 12 // 40% of 30 = 12 points for correct function
    feedback = `✅ Great! You used the correct function (${expectedFunctions.main}).`
  } else {
    feedback = `❌ You need to use the ${expectedFunctions.main} function for this task.`
  }
  
  // Check parameters and syntax
  if (checkSyntaxPatterns(cleanUserFormula, cleanExpectedFormula)) {
    score += 9 // 30% of 30 = 9 points for correct syntax patterns
    feedback += ' The syntax looks good.'
  } else {
    feedback += ' Check your parameters and syntax.'
  }
  
  // Check for common alternative solutions
  const alternativeScore = checkAlternativeSolutions(cleanUserFormula, expectedFunctions.main, taskDescription)
  score += alternativeScore * 3 // Scale alternative points to new system (6 points max)
  
  if (alternativeScore > 0) {
    feedback += ' Your approach shows good Excel knowledge.'
  }
  
  // Bonus points for advanced techniques
  if (hasAdvancedTechniques(cleanUserFormula)) {
    score += 3 // 3 points bonus (scaled from 1)
    feedback += ' 🌟 Nice use of advanced Excel techniques!'
  }
  
  // Cap at 30 points
  score = Math.min(score, 30)
  isCorrect = score >= 24 // 80% of 30 = 24 points threshold
  
  if (score >= 24) {
    feedback = '🎉 ' + feedback
  } else if (score >= 15) {
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
    
    if (action === 'check_formula') {
      // Check formula without saving (for user feedback)
      const { userFormula, expectedFormula, taskDescription } = body
      
      if (!userFormula || !expectedFormula) {
        return NextResponse.json({ error: 'Formula data required' }, { status: 400 })
      }
      
      const evaluation = evaluateExcelFormula(userFormula, expectedFormula, taskDescription)
      
      return NextResponse.json({
        success: true,
        isCorrect: evaluation.isCorrect,
        message: evaluation.isCorrect ? 'Correct! Your formula is right.' : 'Wrong! Please try again or submit to continue.'
      })
    }
    
    if (action === 'evaluate_formula') {
      const { sessionId, taskId, userFormula, expectedFormula, taskDescription, cellReference, timeUp } = body
      
      if (!sessionId || !userFormula) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
      }
      
      // Evaluate the formula
      let evaluation = evaluateExcelFormula(userFormula, expectedFormula, taskDescription)
      
      // If time was up, add a note to the feedback
      if (timeUp) {
        evaluation.feedback += ' ⏰ (Time expired - partial credit given)'
        console.log(`Task completed due to time up: Score ${evaluation.score}`)
      }
      
      const supabase = createServerSupabaseClient()

      // Check if user already has an entry for this task
      const { data: existingTask } = await supabase
        .from('excel_tasks')
        .select('score')
        .eq('session_id', sessionId)
        .eq('task_description', taskDescription)
        .single()

      let finalScore = evaluation.score
      if (existingTask && existingTask.score > evaluation.score) {
        // Keep the higher score
        finalScore = existingTask.score
      }

      // Save or update Excel task result (always keep the best score)
      // First check if task already exists
      const { data: existingTaskCheck } = await supabase
        .from('excel_tasks')
        .select('id, score')
        .eq('session_id', sessionId)
        .eq('task_description', taskDescription)
        .single()

      if (existingTaskCheck) {
        // Update existing task only if new score is better
        if (finalScore > existingTaskCheck.score) {
          const { error: updateError } = await supabase
            .from('excel_tasks')
            .update({
              expected_formula: expectedFormula,
              candidate_formula: userFormula,
              is_correct: finalScore >= 24, // 80% of 30 points
              score: finalScore,
              cell_reference: cellReference
            })
            .eq('id', existingTaskCheck.id)

          if (updateError) {
            console.error('Database error:', updateError)
            return NextResponse.json({ error: 'Failed to update task result' }, { status: 500 })
          }
        }
      } else {
        // Insert new task
        const { error: insertError } = await supabase
          .from('excel_tasks')
          .insert({
            session_id: sessionId,
            task_description: taskDescription,
            expected_formula: expectedFormula,
            candidate_formula: userFormula,
            is_correct: finalScore >= 24, // 80% of 30 points
            score: finalScore,
            cell_reference: cellReference
          })

        if (insertError) {
          console.error('Database error:', insertError)
          return NextResponse.json({ error: 'Failed to save task result' }, { status: 500 })
        }
      }

      // Update session Excel score (sum of all Excel task scores)
      const { data: allTasks } = await supabase
        .from('excel_tasks')
        .select('score')
        .eq('session_id', sessionId)

      const totalExcelScore = allTasks?.reduce((sum, task) => sum + (task.score || 0), 0) || 0

      // Get current interview score to calculate total score
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('interview_score')
        .eq('id', sessionId)
        .single()

      const interviewScore = sessionData?.interview_score || 0
      const totalScore = interviewScore + totalExcelScore

      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          excel_score: totalExcelScore,
          total_score: totalScore,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)

      if (updateError) {
        console.error('Session update error:', updateError)
      }
      
      return NextResponse.json({
        success: true,
        saved: true,
        message: 'Your response has been saved and evaluated.'
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Excel task API error:', error)
    return NextResponse.json({ error: 'Excel task processing failed' }, { status: 500 })
  }
}