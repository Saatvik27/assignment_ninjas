'use client'

import { useEffect, useRef, useState } from 'react'

interface ExcelTaskProps {
  sessionId: string
  onPhaseComplete: () => void
}

interface Task {
  id: string
  title?: string
  description: string
  businessContext?: string
  expectedFormula: string
  expectedResult: string | number
  sampleData: any[][]
  targetCell: string
  alternativeSolutions?: string[]
  hints?: string[]
  difficultyLevel?: string
}

interface AIExcelTask extends Task {
  title: string
  businessContext: string
  alternativeSolutions: string[]
  hints: string[]
  difficultyLevel: string
}

export default function ExcelTask({ sessionId, onPhaseComplete }: ExcelTaskProps) {
  const [currentTask, setCurrentTask] = useState<Task | null>(null)
  const [taskIndex, setTaskIndex] = useState(0)
  const [userFormula, setUserFormula] = useState('')
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [feedback, setFeedback] = useState<{correct: boolean, score: number, message: string} | null>(null)
  const [isLoadingTask, setIsLoadingTask] = useState(false)
  const [currentData, setCurrentData] = useState<any[][]>([])
  const [totalTasks] = useState(2) // Phase 2: 2 Excel questions

  // Generate AI task on component mount and when moving to next task
  useEffect(() => {
    if (!currentTask) {
      generateNextTask()
    }
  }, [])

  useEffect(() => {
    // Update current data when task changes
    if (currentTask) {
      setCurrentData(currentTask.sampleData)
      setUserFormula('')
      setFeedback(null)
    }
  }, [currentTask])

  const generateNextTask = async () => {
    setIsLoadingTask(true)
    try {
      const response = await fetch('/api/excel-task-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          taskNumber: taskIndex + 1,
          difficulty: getDifficultyLevel(),
          previousPerformance: getPreviousPerformance()
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate task')
      }

      const result = await response.json()
      if (result.success && result.task) {
        setCurrentTask(result.task)
        setCurrentData(result.task.sampleData)
      } else {
        throw new Error('Invalid task response')
      }
    } catch (error) {
      console.error('Error generating AI task:', error)
      // Fallback to a basic task if AI generation fails
      setCurrentTask(getFallbackTask())
    } finally {
      setIsLoadingTask(false)
    }
  }

  const getDifficultyLevel = (): 'beginner' | 'intermediate' | 'advanced' => {
    if (taskIndex === 0) return 'beginner'
    if (taskIndex === 1) return 'intermediate' 
    return 'advanced'
  }

  const getPreviousPerformance = (): number => {
    // TODO: Get actual performance from previous tasks
    return 5 // Default middle performance
  }

  const getFallbackTask = (): Task => {
    return {
      id: `fallback-${taskIndex}`,
      title: 'Excel Analysis Task',
      description: 'Calculate the total revenue for the "East" region using a SUMIF formula.',
      businessContext: 'The sales team needs to analyze regional performance for quarterly reporting.',
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
      targetCell: 'D2',
      alternativeSolutions: ['SUMIFS(B:B,A:A,"East")'],
      hints: ['Use SUMIF function', 'Check column references', 'Verify criteria'],
      difficultyLevel: 'intermediate'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent common copy/paste keyboard shortcuts
    if (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'a' || e.key === 'x')) {
      e.preventDefault()
    }
    // Prevent F12 (dev tools)
    if (e.key === 'F12') {
      e.preventDefault()
    }
  }

  const handleFormulaChange = (formula: string) => {
    setUserFormula(formula)
  }

  const evaluateFormula = async () => {
    if (!userFormula.trim()) {
      alert('Please enter a formula in the target cell')
      return
    }

    if (!currentTask) {
      alert('No task available')
      return
    }

    setIsEvaluating(true)
    
    try {
      // Send to backend for advanced evaluation
      const response = await fetch('/api/excel-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate_formula',
          sessionId,
          taskId: currentTask.id,
          userFormula: userFormula.trim(),
          expectedFormula: currentTask.expectedFormula,
          expectedResult: currentTask.expectedResult,
          taskDescription: currentTask.description
        })
      })

      if (!response.ok) {
        throw new Error('Evaluation failed')
      }

      const result = await response.json()
      
      if (result.success) {
        setFeedback({
          correct: result.isCorrect,
          score: result.score,
          message: result.feedback
        })
        
        // Also save the result
        await saveTaskResult(result.isCorrect, result.score, userFormula, result.feedback)
      } else {
        throw new Error(result.error || 'Evaluation failed')
      }

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
    if (!currentTask) return
    
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
    if (taskIndex < totalTasks - 1) {
      const newIndex = taskIndex + 1
      setTaskIndex(newIndex)
      setUserFormula('')
      setFeedback(null)
      setCurrentTask(null) // Clear current task to trigger AI generation
      generateNextTask()
    } else {
      onPhaseComplete()
    }
  }

  const skipTask = () => {
    nextTask()
  }

  return (
    <div 
      className="max-w-6xl mx-auto p-6" 
      onCopy={(e) => e.preventDefault()} 
      onPaste={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Excel Practical Task</h2>
          <div className="flex justify-between items-center">
            <p className="text-gray-600">Task {taskIndex + 1} of {totalTasks}</p>
          </div>
          
          {/* Progress bar */}
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${((taskIndex + 1) / totalTasks) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Task Description */}
        <div className="mb-6">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-md" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
            <h3 className="font-medium text-blue-900 mb-2">Task Instructions:</h3>
            <p className="text-blue-800">{currentTask?.description}</p>
            {currentTask?.businessContext && (
              <p className="text-sm text-blue-700 mt-2">
                <strong>Business Context:</strong> {currentTask.businessContext}
              </p>
            )}
          </div>
        </div>

        {/* Excel-like Data Table */}
        <div className="mb-6">
          <div className="bg-gray-50 p-4 rounded-lg border" style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
            <h4 className="font-medium text-gray-900 mb-3">Sample Data:</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-300">
                <thead>
                  <tr>
                    <th className="border border-gray-300 px-2 py-1 bg-gray-100 text-xs font-medium"></th>
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((col) => (
                      <th key={col} className="border border-gray-300 px-2 py-1 bg-gray-100 text-xs font-medium w-20">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentData.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      <td className="border border-gray-300 px-2 py-1 bg-gray-100 text-xs font-medium text-center">
                        {rowIndex + 1}
                      </td>
                      {Array.from({ length: 7 }, (_, colIndex) => {
                        const value = row[colIndex] || ''
                        const cellRef = String.fromCharCode(65 + colIndex) + (rowIndex + 1)
                        const isTargetCell = cellRef === currentTask?.targetCell
                        
                        return (
                          <td
                            key={colIndex}
                            className={`border border-gray-300 px-2 py-1 text-sm ${
                              isTargetCell 
                                ? 'bg-blue-100 font-medium' 
                                : rowIndex === 0 
                                  ? 'bg-gray-50 font-medium'
                                  : 'bg-white'
                            }`}
                          >
                            {isTargetCell ? (
                              <span className="text-blue-600">
                                {userFormula ? `=${userFormula}` : '{Formula}'}
                              </span>
                            ) : (
                              value
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Target cell <strong>{currentTask?.targetCell}</strong> is highlighted in blue
            </p>
          </div>
        </div>

        {/* Formula Input */}
        <div className="mb-6" onCopy={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter your Excel formula:
          </label>
          <div className="flex items-center space-x-2">
            <span className="text-gray-600">=</span>
            <input
              type="text"
              value={userFormula}
              onChange={(e) => handleFormulaChange(e.target.value)}
              placeholder="Type your formula here..."
              onCopy={(e) => e.preventDefault()}
              onPaste={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Enter the formula without the leading "=" sign. Copy/paste is disabled.
          </p>
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
                {taskIndex < totalTasks - 1 ? 'Next Task' : 'Complete Interview'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}