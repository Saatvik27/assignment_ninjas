'use client'

import { useEffect, useRef, useState } from 'react'

interface ExcelTaskProps {
  sessionId: string
  onPhaseComplete: () => void
}

interface Task {
  id: string
  description: string
  expectedFormula: string
  expectedResult: string | number
  sampleData: any[][]
  targetCell: string
}

// Sample Excel tasks for the interview
const EXCEL_TASKS: Task[] = [
  {
    id: 'task1',
    description: 'Calculate the total revenue for the "East" region using a SUMIF formula.',
    expectedFormula: 'SUMIF(A:A,"East",B:B)',
    expectedResult: 15000,
    sampleData: [
      ['Region', 'Revenue', 'Product'],
      ['East', 5000, 'Product A'],
      ['West', 3000, 'Product B'],
      ['East', 7000, 'Product C'],
      ['North', 4000, 'Product D'],
      ['East', 3000, 'Product E'],
      ['West', 2000, 'Product F']
    ],
    targetCell: 'D2'
  },
  {
    id: 'task2',
    description: 'Count how many sales were made in the "North" region using COUNTIF.',
    expectedFormula: 'COUNTIF(A:A,"North")',
    expectedResult: 1,
    sampleData: [
      ['Region', 'Revenue', 'Product'],
      ['East', 5000, 'Product A'],
      ['West', 3000, 'Product B'],
      ['East', 7000, 'Product C'],
      ['North', 4000, 'Product D'],
      ['East', 3000, 'Product E'],
      ['West', 2000, 'Product F']
    ],
    targetCell: 'D2'
  }
]

declare global {
  interface Window {
    luckysheet: any
  }
}

export default function ExcelTask({ sessionId, onPhaseComplete }: ExcelTaskProps) {
  const [currentTask, setCurrentTask] = useState<Task>(EXCEL_TASKS[0])
  const [taskIndex, setTaskIndex] = useState(0)
  const [userFormula, setUserFormula] = useState('')
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [feedback, setFeedback] = useState<{correct: boolean, score: number, message: string} | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load Luckysheet
    const loadLuckysheet = async () => {
      if (typeof window === 'undefined') return

      // Load Luckysheet CSS
      const cssLink = document.createElement('link')
      cssLink.rel = 'stylesheet'
      cssLink.href = 'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/assets/css/luckysheet.css'
      document.head.appendChild(cssLink)

      // Load Luckysheet JS
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/assets/js/luckysheet.umd.js'
      script.onload = () => initLuckysheet()
      document.head.appendChild(script)
    }

    loadLuckysheet()
  }, [])

  const initLuckysheet = () => {
    if (!window.luckysheet || !containerRef.current) return

    const options = {
      container: 'luckysheet-container',
      title: 'Excel Skills Test',
      lang: 'en',
      data: [
        {
          name: 'Task Data',
          color: '',
          index: 0,
          status: 1,
          order: 0,
          hide: 0,
          row: 20,
          column: 10,
          defaultRowHeight: 25,
          defaultColWidth: 100,
          celldata: convertDataToCellData(currentTask.sampleData)
        }
      ],
      hook: {
        cellEditBefore: function(range: any) {
          // Track cell edits
          console.log('Cell edit started:', range)
        },
        cellUpdateAfter: function(r: number, c: number, oldValue: any, newValue: any) {
          console.log('Cell updated:', { r, c, oldValue, newValue })
          
          // Check if this is the target cell and contains a formula
          if (newValue && typeof newValue === 'object' && newValue.f) {
            setUserFormula(newValue.f)
          }
        }
      }
    }

    window.luckysheet.create(options)
  }

  const convertDataToCellData = (data: any[][]) => {
    const celldata: any[] = []
    
    data.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell !== null && cell !== undefined && cell !== '') {
          celldata.push({
            r: rowIndex,
            c: colIndex,
            v: {
              v: cell,
              m: cell.toString(),
              ct: { fa: 'General', t: typeof cell === 'number' ? 'n' : 'g' }
            }
          })
        }
      })
    })
    
    return celldata
  }

  const evaluateFormula = async () => {
    if (!userFormula.trim()) {
      alert('Please enter a formula in the target cell')
      return
    }

    setIsEvaluating(true)
    
    try {
      // Parse and evaluate the user's formula
      const cleanFormula = userFormula.replace(/^=/, '') // Remove leading =
      
      // Simple formula validation and scoring
      let isCorrect = false
      let score = 0
      let message = ''

      // Check if formula matches expected pattern
      const expectedPattern = currentTask.expectedFormula.toUpperCase()
      const userPattern = cleanFormula.toUpperCase()

      if (userPattern === expectedPattern) {
        isCorrect = true
        score = 10
        message = 'Perfect! Your formula is exactly correct.'
      } else if (userPattern.includes('SUMIF') && currentTask.expectedFormula.includes('SUMIF')) {
        // Partial credit for using the right function
        score = 6
        message = 'Good! You used the correct function, but check your syntax and parameters.'
      } else if (userPattern.includes('COUNTIF') && currentTask.expectedFormula.includes('COUNTIF')) {
        score = 6
        message = 'Good! You used the correct function, but check your syntax and parameters.'
      } else {
        score = 2
        message = 'The formula needs work. Review the task requirements and try again.'
      }

      setFeedback({ correct: isCorrect, score, message })

      // Save to database
      await saveTaskResult(isCorrect, score, userFormula, message)

    } catch (error) {
      console.error('Formula evaluation error:', error)
      setFeedback({ 
        correct: false, 
        score: 0, 
        message: 'Error evaluating formula. Please check your syntax.' 
      })
    } finally {
      setIsEvaluating(false)
    }
  }

  const saveTaskResult = async (isCorrect: boolean, score: number, formula: string, feedback: string) => {
    try {
      const response = await fetch('/api/excel-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          taskId: currentTask.id,
          taskDescription: currentTask.description,
          expectedFormula: currentTask.expectedFormula,
          candidateFormula: formula,
          isCorrect,
          score,
          cellReference: currentTask.targetCell,
          feedback
        })
      })

      if (!response.ok) {
        console.error('Failed to save task result')
      }
    } catch (error) {
      console.error('Error saving task result:', error)
    }
  }

  const nextTask = () => {
    if (taskIndex < EXCEL_TASKS.length - 1) {
      const newIndex = taskIndex + 1
      setTaskIndex(newIndex)
      setCurrentTask(EXCEL_TASKS[newIndex])
      setUserFormula('')
      setFeedback(null)
      
      // Reinitialize Luckysheet with new data
      if (window.luckysheet) {
        window.luckysheet.destroy()
        setTimeout(() => initLuckysheet(), 500)
      }
    } else {
      onPhaseComplete()
    }
  }

  const skipTask = () => {
    nextTask()
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Excel Practical Task</h2>
          <div className="flex justify-between items-center">
            <p className="text-gray-600">Task {taskIndex + 1} of {EXCEL_TASKS.length}</p>
          </div>
          
          {/* Progress bar */}
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${((taskIndex + 1) / EXCEL_TASKS.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Task Description */}
        <div className="mb-6">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-md">
            <h3 className="font-medium text-blue-900 mb-2">Task Instructions:</h3>
            <p className="text-blue-800">{currentTask.description}</p>
            <p className="text-sm text-blue-700 mt-2">
              Enter your formula in cell <strong>{currentTask.targetCell}</strong>
            </p>
          </div>
        </div>

        {/* Luckysheet Container */}
        <div className="mb-6">
          <div 
            id="luckysheet-container"
            ref={containerRef}
            style={{ 
              width: '100%', 
              height: '400px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          ></div>
        </div>

        {/* Current Formula Display */}
        {userFormula && (
          <div className="mb-4">
            <div className="bg-gray-50 p-3 rounded-md">
              <h4 className="font-medium text-gray-900 mb-1">Your Formula:</h4>
              <code className="text-sm bg-white px-2 py-1 rounded border">=  {userFormula}</code>
            </div>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div className="mb-6">
            <div className={`border-l-4 p-4 rounded-md ${
              feedback.correct ? 'bg-green-50 border-green-400' : 'bg-yellow-50 border-yellow-400'
            }`}>
              <h4 className={`font-medium mb-2 ${
                feedback.correct ? 'text-green-900' : 'text-yellow-900'
              }`}>
                Score: {feedback.score}/10
              </h4>
              <p className={feedback.correct ? 'text-green-800' : 'text-yellow-800'}>
                {feedback.message}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <button
            onClick={skipTask}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
            disabled={isEvaluating}
          >
            Skip Task
          </button>
          
          <div className="space-x-3">
            <button
              onClick={evaluateFormula}
              disabled={isEvaluating || !userFormula}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md"
            >
              {isEvaluating ? 'Evaluating...' : 'Check Formula'}
            </button>
            
            {feedback && (
              <button
                onClick={nextTask}
                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md"
              >
                {taskIndex < EXCEL_TASKS.length - 1 ? 'Next Task' : 'Complete Interview'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}