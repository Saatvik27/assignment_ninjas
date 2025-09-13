'use client'

import { useState, useEffect } from 'react'
import AudioRecorder from '@/components/AudioRecorder'

interface VoiceInterviewProps {
  sessionId: string
  onPhaseComplete: () => void
  shouldStartInterview?: boolean
  firstQuestion?: string
}

interface Question {
  id: string
  text: string
}

interface Answer {
  transcript: string
  score?: number
  reasoning?: string
}

export default function VoiceInterview({ sessionId, onPhaseComplete, shouldStartInterview = false, firstQuestion }: VoiceInterviewProps) {
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [currentAnswer, setCurrentAnswer] = useState<Answer | null>(null)
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false)
  const [isScoring, setIsScoring] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<Array<{question: string, answer: string, score?: number}>>([])
  const [totalScore, setTotalScore] = useState(0)

  const maxQuestions = 5 // Limit for MVP

  // Generate first question when shouldStartInterview becomes true
  useEffect(() => {
    if (shouldStartInterview && !currentQuestion) {
      if (firstQuestion) {
        // Use pre-generated first question
        setCurrentQuestion({ id: 'first-question', text: firstQuestion })
        setCurrentAnswer(null)
      } else {
        // Fallback to generating question
        generateQuestion()
      }
    }
  }, [shouldStartInterview, firstQuestion])

  const generateQuestion = async () => {
    setIsGeneratingQuestion(true)
    
    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'generate_question',
          questionNumber,
          difficulty: questionNumber <= 2 ? 'intermediate' : 'advanced'
        })
      })

      if (!response.ok) throw new Error('Failed to generate question')

      const result = await response.json()
      
      if (result.success) {
        setCurrentQuestion({ id: result.eventId, text: result.question })
        setCurrentAnswer(null)
        
        // Play question using TTS
        await playQuestion(result.question)
      }
    } catch (error) {
      console.error('Error generating question:', error)
      setCurrentQuestion({ 
        id: 'fallback', 
        text: 'What is the difference between VLOOKUP and INDEX-MATCH functions in Excel?' 
      })
    } finally {
      setIsGeneratingQuestion(false)
    }
  }

  const playQuestion = async (questionText: string) => {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: questionText })
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.audioUrl) {
          const audio = new Audio(data.audioUrl)
          await audio.play()
        }
      }
    } catch (error) {
      console.error('Failed to play question:', error)
    }
  }

  const onTranscriptReceived = async (transcript: string, eventId: string) => {
    setCurrentAnswer({ transcript })
    
    if (!currentQuestion) return

    // Score the answer
    setIsScoring(true)
    
    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'score_answer',
          transcript,
          questionContext: currentQuestion.text
        })
      })

      if (!response.ok) throw new Error('Failed to score answer')

      const result = await response.json()
      
      if (result.success) {
        const updatedAnswer: Answer = {
          transcript,
          score: result.score,
          reasoning: result.reasoning
        }
        
        setCurrentAnswer(updatedAnswer)
        
        // Update conversation history
        const newEntry = {
          question: currentQuestion.text,
          answer: transcript,
          score: result.score
        }
        
        setConversationHistory(prev => [...prev, newEntry])
        setTotalScore(prev => prev + result.score)
        
        // Play follow-up question if we haven't reached the limit
        if (questionNumber < maxQuestions) {
          setTimeout(() => {
            setQuestionNumber(prev => prev + 1)
            playQuestion(result.followupQuestion)
            setCurrentQuestion({ 
              id: result.followupEventId, 
              text: result.followupQuestion 
            })
            setCurrentAnswer(null)
          }, 3000) // 3 second delay to show score
        } else {
          // Interview complete
          setTimeout(() => {
            onPhaseComplete()
          }, 3000)
        }
      }
    } catch (error) {
      console.error('Error scoring answer:', error)
    } finally {
      setIsScoring(false)
    }
  }

  const skipQuestion = () => {
    if (questionNumber < maxQuestions) {
      setQuestionNumber(prev => prev + 1)
      generateQuestion()
    } else {
      onPhaseComplete()
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Voice Interview</h2>
          <div className="flex justify-between items-center">
            <p className="text-gray-600">Question {questionNumber} of {maxQuestions}</p>
            <p className="text-sm text-gray-500">Total Score: {totalScore}/{conversationHistory.length * 10}</p>
          </div>
          
          {/* Progress bar */}
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${(questionNumber / maxQuestions) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Current Question */}
        <div className="mb-8">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-md">
            <h3 className="font-medium text-blue-900 mb-2">Current Question:</h3>
            {isGeneratingQuestion ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <p className="text-blue-800">Generating question...</p>
              </div>
            ) : (
              <p className="text-blue-800 text-lg">{currentQuestion?.text}</p>
            )}
          </div>
        </div>

        {/* Audio Recorder */}
        <div className="mb-8">
          <AudioRecorder 
            sessionId={sessionId}
            onTranscriptReceived={onTranscriptReceived}
            isEnabled={!!currentQuestion && !isGeneratingQuestion && !currentAnswer}
          />
        </div>

        {/* Current Answer Display */}
        {currentAnswer && (
          <div className="mb-6">
            <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-md">
              <h4 className="font-medium text-green-900 mb-2">Your Answer:</h4>
              <p className="text-green-800 mb-3">"{currentAnswer.transcript}"</p>
              
              {isScoring ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                  <p className="text-green-700">Scoring your answer...</p>
                </div>
              ) : currentAnswer.score !== undefined ? (
                <div>
                  <p className="text-sm font-medium text-green-900">
                    Score: {currentAnswer.score}/10
                  </p>
                  {currentAnswer.reasoning && (
                    <p className="text-sm text-green-700 mt-1">
                      {currentAnswer.reasoning}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Conversation History */}
        {conversationHistory.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-900 mb-3">Previous Questions & Answers:</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {conversationHistory.map((entry, index) => (
                <div key={index} className="bg-gray-50 p-3 rounded-md text-sm">
                  <p className="font-medium text-gray-900 mb-1">Q{index + 1}: {entry.question}</p>
                  <p className="text-gray-700 mb-1">A: {entry.answer}</p>
                  {entry.score !== undefined && (
                    <p className="text-xs text-gray-600">Score: {entry.score}/10</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <button
            onClick={skipQuestion}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
            disabled={isGeneratingQuestion || isScoring}
          >
            Skip Question
          </button>
          
          {questionNumber >= maxQuestions && !isScoring && (
            <button
              onClick={onPhaseComplete}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md"
            >
              Continue to Excel Task
            </button>
          )}
        </div>
      </div>
    </div>
  )
}