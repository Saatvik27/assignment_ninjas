import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from "@google/genai"
import { createServerSupabaseClient } from '@/lib/supabase'

// Initialize Gemini client
const ai = new GoogleGenAI({})

interface ExcelTaskRequest {
  sessionId: string
  taskNumber: number
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  previousPerformance?: number
}

interface AIExcelTask {
  id: string
  title: string
  description: string
  businessContext: string
  sampleData: any[][]
  targetCell: string
  expectedFormula: string
  expectedResult: number | string
  alternativeSolutions: string[]
  hints: string[]
  difficultyLevel: string
}

// Excel function templates for AI to work with
const EXCEL_FUNCTIONS = {
  beginner: ['SUMIF', 'COUNTIF', 'VLOOKUP', 'IF', 'CONCATENATE'],
  intermediate: ['SUMIFS', 'COUNTIFS', 'INDEX/MATCH', 'AVERAGEIFS', 'INDIRECT'],
  advanced: ['ARRAY FORMULAS', 'XLOOKUP', 'FILTER', 'UNIQUE', 'COMPLEX NESTED FUNCTIONS']
}

// Business scenarios for context
const BUSINESS_SCENARIOS = [
  'multi-region sales performance with quota analysis and variance reporting',
  'marketing campaign ROI with customer acquisition cost and lifetime value calculations',
  'advanced inventory management with reorder points and seasonal demand forecasting', 
  'employee performance review with weighted KPIs and ranking systems',
  'financial budget analysis with variance tracking and rolling forecasts',
  'customer satisfaction tracking with cohort analysis and churn prediction',
  'supply chain optimization with vendor performance and cost analysis',
  'project cost analysis with resource allocation and profitability modeling',
  'commission calculation with tiered rates and team performance bonuses',
  'product profitability analysis with cost allocation and margin optimization'
]

async function generateExcelTaskWithAI(params: ExcelTaskRequest): Promise<AIExcelTask> {
  const { taskNumber, difficulty = 'intermediate', previousPerformance = 5 } = params
  
  // Default to higher difficulty for more challenging questions
  const actualDifficulty = difficulty === 'beginner' ? 'intermediate' : difficulty === 'intermediate' ? 'advanced' : 'advanced'
  
  // Select appropriate functions based on difficulty
  const availableFunctions = EXCEL_FUNCTIONS[actualDifficulty]
  const selectedFunction = availableFunctions[Math.floor(Math.random() * availableFunctions.length)]
  
  // Select business scenario
  const scenario = BUSINESS_SCENARIOS[Math.floor(Math.random() * BUSINESS_SCENARIOS.length)]
  
  const prompt = `You are an Excel skills assessment expert creating CHALLENGING real-world Excel tasks. Create a complete Excel task with the following requirements:

TASK REQUIREMENTS:
- Difficulty Level: ${actualDifficulty} (MAKE THIS GENUINELY CHALLENGING)
- Task Number: ${taskNumber}
- Target Excel Function: ${selectedFunction}
- Business Scenario: ${scenario}
- Previous Performance: ${previousPerformance}/10

CREATE A CHALLENGING EXCEL TASK THAT TESTS ADVANCED SKILLS:

1. **Business Context**: A complex, realistic workplace scenario (3-4 sentences) explaining a multi-faceted business problem that requires advanced Excel analysis.

2. **Task Description**: Clear but sophisticated instructions requiring the candidate to perform complex calculations. The task should involve multiple criteria, conditional logic, or data manipulation. DO NOT mention specific cell references.

3. **Sample Data**: Create 10-12 rows of realistic, complex business data:
   - Row 1: Multiple column headers (6-8 columns)
   - Rows 2-12: Realistic data with variety in categories, dates, numbers, and text
   - Include edge cases (nulls, zeros, different categories)
   - Ensure data supports complex ${selectedFunction} operations
   - Make the data require careful analysis to solve

4. **Expected Formula**: A sophisticated Excel formula that demonstrates advanced skills (nested functions, multiple criteria, etc.)

5. **Expected Result**: The precise numeric/text result

6. **Alternative Solutions**: 2-3 different advanced approaches to solve the problem

7. **Hints**: 3 progressive hints that guide toward advanced Excel techniques

DIFFICULTY REQUIREMENTS FOR ${actualDifficulty.toUpperCase()}:
- Use nested functions and multiple criteria
- Require understanding of Excel's advanced features
- Include edge cases and complex logic
- Test real business problem-solving skills
- Avoid simple single-function solutions

Respond in valid JSON format:
{
  "title": "Challenging business task title",
  "description": "Complex task instructions requiring advanced Excel skills",
  "businessContext": "Complex business scenario requiring sophisticated analysis",
  "sampleData": [
    ["Column1", "Column2", "Column3", "Column4", "Column5", "Column6"],
    // ... 10+ rows of complex, realistic data
  ],
  "targetCell": "H2",
  "expectedFormula": "Complex formula using ${selectedFunction}",
  "expectedResult": "Expected result",
  "alternativeSolutions": ["Advanced approach 1", "Advanced approach 2", "Advanced approach 3"],
  "hints": ["Advanced hint 1", "Advanced hint 2", "Advanced hint 3"],
  "difficultyLevel": "${actualDifficulty}"
}

CRITICAL: Make this task genuinely challenging - it should test advanced Excel skills, not basic operations.`

  try {
    // Use Gemini to generate the Excel task
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    })
    
    const generatedText = response.text || ''
    
    // Clean up the response to extract JSON
    let cleanText = generatedText.trim()
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    const aiTask = JSON.parse(cleanText)
    
    // Add unique ID and validate structure
    const task: AIExcelTask = {
      id: `ai-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: aiTask.title || 'Excel Analysis Task',
      description: aiTask.description || 'Complete the Excel analysis',
      businessContext: aiTask.businessContext || 'Business analysis required',
      sampleData: aiTask.sampleData || [['Data', 'Value'], ['Item 1', 100]],
      targetCell: aiTask.targetCell || 'D2',
      expectedFormula: aiTask.expectedFormula || 'SUM(B:B)',
      expectedResult: aiTask.expectedResult || 0,
      alternativeSolutions: aiTask.alternativeSolutions || [],
      hints: aiTask.hints || ['Use Excel functions', 'Check your formula', 'Verify the result'],
      difficultyLevel: difficulty
    }

    return task

  } catch (error) {
    console.error('AI Excel task generation error:', error)
    
    // Fallback to a basic generated task if AI fails
    return generateFallbackTask(selectedFunction, scenario, difficulty, taskNumber)
  }
}

function generateFallbackTask(func: string, scenario: string, difficulty: string, taskNumber: number): AIExcelTask {
  const fallbackTasks = {
    'SUMIF': {
      title: 'Sales Analysis - Regional Total',
      description: 'Calculate the total revenue for the "North" region using a SUMIF formula.',
      businessContext: 'The sales team needs to analyze regional performance for quarterly reporting.',
      sampleData: [
        ['Region', 'Revenue', 'Product'],
        ['North', 5000, 'Product A'],
        ['South', 3000, 'Product B'],
        ['North', 7000, 'Product C'],
        ['East', 4000, 'Product D'],
        ['North', 2000, 'Product E']
      ],
      expectedFormula: 'SUMIF(A:A,"North",B:B)',
      expectedResult: 14000
    },
    'COUNTIF': {
      title: 'Inventory Count Analysis',
      description: 'Count how many products have "Electronics" as their category using COUNTIF.',
      businessContext: 'Inventory management needs to track product categories for restocking.',
      sampleData: [
        ['Product', 'Category', 'Stock'],
        ['Laptop', 'Electronics', 50],
        ['Chair', 'Furniture', 20],
        ['Phone', 'Electronics', 30],
        ['Desk', 'Furniture', 15],
        ['Tablet', 'Electronics', 25]
      ],
      expectedFormula: 'COUNTIF(B:B,"Electronics")',
      expectedResult: 3
    }
  }

  const template = fallbackTasks[func as keyof typeof fallbackTasks] || fallbackTasks['SUMIF']
  
  return {
    id: `fallback-task-${Date.now()}`,
    title: template.title,
    description: template.description,
    businessContext: template.businessContext,
    sampleData: template.sampleData,
    targetCell: 'D2',
    expectedFormula: template.expectedFormula,
    expectedResult: template.expectedResult,
    alternativeSolutions: [],
    hints: ['Use the appropriate Excel function', 'Check the column references', 'Verify your criteria'],
    difficultyLevel: difficulty
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, taskNumber = 1, difficulty = 'intermediate', previousPerformance } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    // Generate AI-powered Excel task
    console.log(`Generating AI Excel task ${taskNumber} for session ${sessionId}`)
    const aiTask = await generateExcelTaskWithAI({
      sessionId,
      taskNumber,
      difficulty,
      previousPerformance
    })

    // Save the generated task to database for reference
    const supabase = createServerSupabaseClient()
    
    // Try to save to ai_excel_tasks table, fallback to excel_tasks if it doesn't exist
    try {
      const { data, error } = await supabase
        .from('ai_excel_tasks')
        .insert({
          session_id: sessionId,
          task_id: aiTask.id,
          task_number: taskNumber,
          title: aiTask.title,
          description: aiTask.description,
          business_context: aiTask.businessContext,
          sample_data: JSON.stringify(aiTask.sampleData),
          expected_formula: aiTask.expectedFormula,
          expected_result: aiTask.expectedResult,
          difficulty_level: aiTask.difficultyLevel,
          alternative_solutions: JSON.stringify(aiTask.alternativeSolutions),
          hints: JSON.stringify(aiTask.hints),
          target_cell: aiTask.targetCell
        })
        .select()
        .single()

      if (error) {
        console.error('Failed to save to ai_excel_tasks:', error)
        
        // Fallback: save to excel_tasks table
        await supabase
          .from('excel_tasks')
          .insert({
            session_id: sessionId,
            task_description: aiTask.description,
            expected_formula: aiTask.expectedFormula,
            cell_reference: aiTask.targetCell
          })
        
        console.log('Saved to excel_tasks table as fallback')
      }
    } catch (dbError) {
      console.error('Database save error:', dbError)
      // Continue anyway - the task was generated successfully
    }

    // Log the generated task solution for testing purposes
    console.log('=== EXCEL TASK GENERATED ===')
    console.log('Task Number:', taskNumber)
    console.log('Title:', aiTask.title)
    console.log('Description:', aiTask.description)
    console.log('Expected Formula:', aiTask.expectedFormula)
    console.log('Expected Result:', aiTask.expectedResult)
    console.log('Alternative Solutions:', aiTask.alternativeSolutions)
    console.log('Target Cell:', aiTask.targetCell)
    console.log('Difficulty:', aiTask.difficultyLevel)
    console.log('============================')

    return NextResponse.json({
      success: true,
      task: aiTask
    })

  } catch (error) {
    console.error('Excel task generator API error:', error)
    return NextResponse.json({ 
      error: 'Failed to generate Excel task',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}