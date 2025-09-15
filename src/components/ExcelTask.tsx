'use client'

import { useState, useEffect, useRef } from 'react'

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
  const [checkResult, setCheckResult] = useState<{ isCorrect: boolean; message: string } | null>(null)
  const [isLoadingTask, setIsLoadingTask] = useState(false)
  const [currentData, setCurrentData] = useState<any[][]>([])
  const [totalTasks] = useState(2) // Phase 2: 2 Excel questions
  const [timeRemaining, setTimeRemaining] = useState(10 * 60) // 10 minutes in seconds per task
  const [isTimeUp, setIsTimeUp] = useState(false)
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null)
  const [showInstructions, setShowInstructions] = useState(true)
  const isGeneratingTaskRef = useRef(false)

  // Generate AI task on component mount and when moving to next task
  useEffect(() => {
    if (!currentTask && !isGeneratingTaskRef.current) {
      generateNextTask()
    }
  }, [])

  // Timer effect - only start when instructions are dismissed
  useEffect(() => {
    if (currentTask && !isTimeUp && !showInstructions) {
      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setIsTimeUp(true)
            clearInterval(interval)
            // Auto-submit when time is up and move to completion
            handleTimeUp()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      setTimerInterval(interval)
      
      return () => {
        clearInterval(interval)
      }
    }
  }, [currentTask, isTimeUp, showInstructions])

  // Handle time up scenario
  const handleTimeUp = async () => {
    console.log('Time is up for Excel task!', `Task ${taskIndex + 1} of ${totalTasks}`)
    
    // Save current progress if there's a formula entered
    if (userFormula.trim() && currentTask) {
      try {
        await fetch('/api/excel-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'evaluate_formula',
            sessionId,
            taskId: currentTask.id,
            userFormula: userFormula.trim(),
            expectedFormula: currentTask.expectedFormula,
            expectedResult: currentTask.expectedResult,
            taskDescription: currentTask.description,
            timeUp: true // Flag to indicate time ran out
          })
        })
        console.log('Time-up progress saved successfully')
      } catch (error) {
        console.error('Error saving progress when time up:', error)
      }
    }
    
    // Check if this was the last task
    if (taskIndex >= totalTasks - 1) {
      // This was the last task, move to completion
      setTimeout(() => {
        console.log('Time up on final task - moving to completion')
        onPhaseComplete()
      }, 2000)
    } else {
      // Move to next task
      setTimeout(() => {
        console.log('Time up - moving to next task')
        moveToNextTask()
      }, 2000)
    }
  }

  // Reset timer when moving to next task
  useEffect(() => {
    setTimeRemaining(10 * 60) // Reset to 10 minutes
    setIsTimeUp(false)
    setShowInstructions(true) // Show instructions for new task
    if (timerInterval) {
      clearInterval(timerInterval)
      setTimerInterval(null)
    }
  }, [taskIndex])

  useEffect(() => {
    // Update current data when task changes
    if (currentTask) {
      setCurrentData(currentTask.sampleData)
      setUserFormula('')
      setFeedback(null)
    }
  }, [currentTask])

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const generateNextTask = async () => {
    if (isGeneratingTaskRef.current) {
      console.log('Already generating task, ignoring duplicate call')
      return
    }
    
    isGeneratingTaskRef.current = true
    setIsLoadingTask(true)
    
    try {
      console.log('Generating AI Excel task', taskIndex + 1, 'for session', sessionId)
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
        console.log('=== EXCEL TASK LOADED ===')
        console.log('Task:', taskIndex + 1, 'of', totalTasks)
        console.log('Title:', result.task.title)
        console.log('Expected Solution:', result.task.expectedFormula)
        console.log('Expected Result:', result.task.expectedResult)
        console.log('Alternative Solutions:', result.task.alternativeSolutions)
        console.log('========================')
        
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
      isGeneratingTaskRef.current = false
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
    setCheckResult(null) // Clear previous check results when formula changes
  }

  const checkFormula = async () => {
    if (!userFormula.trim()) {
      alert('Please enter a formula to check')
      return
    }

    if (!currentTask) {
      alert('No task available')
      return
    }

    setIsEvaluating(true)
    setCheckResult(null)
    
    try {
      const response = await fetch('/api/excel-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check_formula',
          sessionId,
          taskId: currentTask.id,
          userFormula: userFormula.trim(),
          expectedFormula: currentTask.expectedFormula,
          expectedResult: currentTask.expectedResult,
          taskDescription: currentTask.description
        })
      })

      if (!response.ok) {
        throw new Error('Check failed')
      }

      const result = await response.json()
      
      if (result.success) {
        setCheckResult({
          isCorrect: result.isCorrect,
          message: result.isCorrect ? 'Correct! Your formula is right.' : 'Not quite right. Try again.'
        })
      } else {
        throw new Error(result.error || 'Check failed')
      }

    } catch (error) {
      console.error('Formula check error:', error)
      setCheckResult({
        isCorrect: false,
        message: 'Error checking formula. Please try again.'
      })
    } finally {
      setIsEvaluating(false)
    }
  }

  const evaluateFormula = async () => {
    if (!userFormula.trim()) {
      alert('Please enter a formula before submitting')
      return
    }

    if (!currentTask) {
      alert('No task available')
      return
    }

    setIsEvaluating(true)
    
    try {
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
        throw new Error('Submission failed')
      }

      const result = await response.json()
      
      if (result.success) {
        // Show saving message instead of score
        setFeedback({
          correct: true, // Don't show actual result
          score: 0, // Don't show score
          message: 'Your response has been saved and evaluated.'
        })
        
        // Move to next task after a short delay
        setTimeout(() => {
          moveToNextTask()
        }, 2000)
      } else {
        throw new Error(result.error || 'Submission failed')
      }

    } catch (error) {
      console.error('Formula submission error:', error)
      setFeedback({ 
        correct: false, 
        score: 0, 
        message: 'Error submitting formula. Please try again.' 
      })
    } finally {
      setIsEvaluating(false)
    }
  }

  const moveToNextTask = () => {
    if (taskIndex < totalTasks - 1) {
      const newIndex = taskIndex + 1
      console.log('=== MOVING TO NEXT EXCEL TASK ===')
      console.log('From task:', taskIndex + 1, 'to task:', newIndex + 1)
      console.log('Resetting: formula, feedback, task data')
      console.log('================================')
      
      setTaskIndex(newIndex)
      setUserFormula('')
      setFeedback(null)
      setCheckResult(null)
      setCurrentTask(null) // Clear current task to trigger AI generation
      generateNextTask()
    } else {
      onPhaseComplete()
    }
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
        {showInstructions ? (
          <div className="text-center">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Phase 2: Excel Practical Tasks</h2>
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-left max-w-2xl mx-auto">
                <h3 className="text-lg font-semibold text-green-900 mb-3">Instructions</h3>
                <ul className="space-y-2 text-green-800">
                  <li>• You will complete <strong>2 Excel practical tasks</strong></li>
                  <li>• Each task has a <strong>10-minute time limit</strong></li>
                  <li>• ⏰ <strong>Timer starts when you click "Start Excel Tasks"</strong></li>
                  <li>• Read the business scenario and analyze the provided data</li>
                  <li>• Enter the required formula in the designated cell</li>
                  <li>• Use <strong>"Check Formula"</strong> to test if your formula is correct</li>
                  <li>• When ready, click <strong>"Submit & Continue"</strong> to proceed</li>
                  <li>• Copy and paste functions are disabled for security</li>
                  <li>• If time runs out, your progress will be auto-saved</li>
                </ul>
              </div>
            </div>
            <button
              onClick={() => {
                setShowInstructions(false)
                if (!currentTask) {
                  generateNextTask()
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-8 rounded-md text-lg"
            >
              Start Excel Tasks
            </button>
          </div>
        ) : (
          <>
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
          
          {/* Timer Display - only show when task is active */}
          {!showInstructions && (
            <div className="mt-4 text-center">
              <div className={`inline-flex items-center px-4 py-2 rounded-lg font-medium text-lg ${
                timeRemaining <= 60 ? 'bg-red-100 text-red-800' : 
                timeRemaining <= 300 ? 'bg-yellow-100 text-yellow-800' : 
                'bg-green-100 text-green-800'
              }`}>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Time Remaining: {formatTime(timeRemaining)}
                {isTimeUp && <span className="ml-2 text-red-600 font-bold">TIME UP!</span>}
              </div>
              {isTimeUp && (
                <p className="mt-2 text-red-600 font-medium">
                  Saving your progress and moving to completion...
                </p>
              )}
            </div>
          )}
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
              {/* Removed score display for candidates */}
              <p className={feedback.correct ? 'text-green-800' : 'text-yellow-800'}>
                {feedback.message}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between">          
          <div className="space-x-3">
            <button
              onClick={checkFormula}
              disabled={isEvaluating || !userFormula}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md"
            >
              {isEvaluating ? 'Checking...' : 'Check Formula'}
            </button>
            
            <button
              onClick={evaluateFormula}
              disabled={isEvaluating || !userFormula}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md"
            >
              {isEvaluating ? 'Submitting...' : (taskIndex < totalTasks - 1 ? 'Submit & Continue' : 'Submit & Complete')}
            </button>
          </div>
        </div>

        {/* Check Result Display */}
        {checkResult && (
          <div className={`mt-4 p-4 rounded-lg ${checkResult.isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className={`font-medium ${checkResult.isCorrect ? 'text-green-800' : 'text-red-800'}`}>
              {checkResult.message}
            </div>
          </div>
        )}

        {/* Feedback Display */}
        {feedback && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-blue-800 font-medium">
              {feedback.message}
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  )
}