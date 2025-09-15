'use client'

import { useState, useEffect, useRef } from 'react'
import TimedAudioRecorder from '@/components/TimedAudioRecorder'

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
  const [showInstructions, setShowInstructions] = useState(true)
  const [questionAudioReady, setQuestionAudioReady] = useState(false)
  const [processedTranscripts, setProcessedTranscripts] = useState(new Set<string>())
  const [processingTranscript, setProcessingTranscript] = useState<string | null>(null)
  const [phaseCompleted, setPhaseCompleted] = useState(false)
  const [noSpeechAlertShown, setNoSpeechAlertShown] = useState(false)
  
  // Use ref to track question generation requests to prevent race conditions
  const generatingQuestionRef = useRef<number | null>(null)

  const maxQuestions = 8 // Phase 1: 8 interview questions

  // Wrapper to prevent multiple phase completion calls
  const handlePhaseComplete = async () => {
    if (phaseCompleted) {
      console.log('Phase already completed, ignoring duplicate call')
      return
    }
    console.log('Completing Phase 1, moving to Phase 2')
    setPhaseCompleted(true)
    
    // Save final interview summary before moving to next phase
    try {
      await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'complete_interview',
          totalScore,
          questionsAnswered: conversationHistory.length
        })
      })
      console.log('Interview completion saved successfully')
    } catch (error) {
      console.error('Error saving interview completion:', error)
    }
    
    onPhaseComplete()
  }

  // Generate first question when both shouldStartInterview is true AND instructions are dismissed
  useEffect(() => {
    if (shouldStartInterview && !showInstructions && !currentQuestion) {
      // Reset conversation history at the start of a new interview
      setConversationHistory([])
      setQuestionNumber(1)
      setTotalScore(0)
      setNoSpeechAlertShown(false)
      
      if (firstQuestion) {
        // Use pre-generated first question
        setCurrentQuestion({ id: 'first-question', text: firstQuestion })
        setCurrentAnswer(null)
        setQuestionAudioReady(false)
        // Use playQuestion for consistency with other questions
        playQuestion(firstQuestion).then(() => {
          setQuestionAudioReady(true)
        })
      } else {
        // Fallback to generating question
        generateQuestion()
      }
    }
  }, [shouldStartInterview, firstQuestion, showInstructions])

  const cleanTextForSpeech = (text: string) => {
    return text
      // Remove backticks used for code formatting
      .replace(/`/g, '')
      // Remove square brackets but keep the content
      .replace(/\[([^\]]*)\]/g, '$1')
      // Remove parentheses around technical terms but keep content
      .replace(/\(([^)]*)\)/g, '$1')
      // Remove underscores used for emphasis
      .replace(/_/g, '')
      // Replace common technical symbols with spoken equivalents
      .replace(/&/g, 'and')
      .replace(/'/g, "'")  // Replace smart quotes with regular quotes
      .replace(/"/g, '"')  // Replace smart quotes with regular quotes
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      .trim()
  }

  const readQuestionAloud = async (questionText: string) => {
    try {
      const cleanedText = cleanTextForSpeech(questionText)
      console.log('Reading question aloud:', cleanedText)
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Here's your question: ${cleanedText}`,
          speechRate: 0.75  // Slow down to 75% of normal speed
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.audioUrl) {
          const audio = new Audio(data.audioUrl)
          // Wait for audio to finish before returning
          await new Promise((resolve) => {
            audio.onended = resolve
            audio.onerror = resolve // Also resolve on error to prevent hanging
            audio.play()
          })
          console.log('Question audio finished playing')
        }
      } else {
        console.error('Failed to generate question TTS')
      }
    } catch (error) {
      console.error('Error reading question aloud:', error)
    }
  }

  const generateQuestion = async (questionNum?: number) => {
    const currentQuestionNumber = questionNum || questionNumber
    
    // Enhanced duplicate prevention with ref tracking
    if (isGeneratingQuestion || generatingQuestionRef.current === currentQuestionNumber) {
      console.log('Already generating question', currentQuestionNumber, ', ignoring duplicate call')
      return
    }
    
    // Mark this specific question number as being generated
    generatingQuestionRef.current = currentQuestionNumber
    setIsGeneratingQuestion(true)
    
    // Add small delay to prevent rapid API calls
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Final safety check - don't generate if we've reached the limit
    if (currentQuestionNumber > maxQuestions) {
      console.log('Question limit reached, calling handlePhaseComplete')
      setIsGeneratingQuestion(false)
      handlePhaseComplete()
      return
    }
    
    try {
      const response = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action: 'generate_question',
          questionNumber: currentQuestionNumber,
          difficulty: currentQuestionNumber <= 2 ? 'intermediate' : 'advanced'
        })
      })

      if (!response.ok) throw new Error('Failed to generate question')

      const result = await response.json()
      
      if (result.success) {
        setCurrentQuestion({ id: result.eventId, text: result.question })
        setCurrentAnswer(null)
        setQuestionAudioReady(false)
        setNoSpeechAlertShown(false) // Reset alert flag for new question
        
        // Only use playQuestion (which includes text cleaning and proper timing)
        await playQuestion(result.question)
        setQuestionAudioReady(true)
      }
    } catch (error) {
      console.error('Error generating question:', error)
      setCurrentQuestion({ 
        id: 'fallback', 
        text: 'What is the difference between VLOOKUP and INDEX-MATCH functions in Excel?' 
      })
    } finally {
      setIsGeneratingQuestion(false)
      generatingQuestionRef.current = null
    }
  }

  const playQuestion = async (questionText: string) => {
    try {
      const cleanedText = cleanTextForSpeech(questionText)
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: cleanedText,
          speechRate: 0.75  // Slow down to 75% of normal speed
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.audioUrl) {
          const audio = new Audio(data.audioUrl)
          // Wait for audio to finish before enabling recorder
          await new Promise((resolve) => {
            audio.onended = resolve
            audio.onerror = resolve // Also resolve on error to prevent hanging
            audio.play()
          })
          setQuestionAudioReady(true)
        }
      }
    } catch (error) {
      console.error('Failed to play question:', error)
      // Enable recorder even if TTS fails
      setQuestionAudioReady(true)
    }
  }

  const onTranscriptReceived = async (transcript: string, eventId: string) => {
    // Prevent duplicate processing with enhanced checks
    const transcriptKey = `${transcript}-${questionNumber}`
    if (processedTranscripts.has(transcriptKey) || isScoring || processingTranscript === transcript) {
      console.log('Duplicate transcript detected, ignoring:', transcript, 'Key:', transcriptKey)
      return
    }
    
    // Mark as processing to prevent concurrent calls
    setProcessingTranscript(transcript)
    setProcessedTranscripts(prev => new Set([...prev, transcriptKey]))
    setCurrentAnswer({ transcript })
    
    if (!currentQuestion) {
      setProcessingTranscript(null)
      return
    }

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
        
        // Update conversation history - check for duplicates
        const newEntry = {
          question: currentQuestion.text,
          answer: transcript,
          score: result.score
        }
        
        // Prevent duplicate entries in conversation history
        setConversationHistory(prev => {
          // Create a unique key for this Q&A pair
          const uniqueKey = `${questionNumber}-${currentQuestion.text.substring(0, 50)}-${transcript.substring(0, 50)}`
          
          const isDuplicate = prev.some(entry => {
            const entryKey = `${prev.indexOf(entry) + 1}-${entry.question.substring(0, 50)}-${entry.answer.substring(0, 50)}`
            return entryKey === uniqueKey || 
                   (entry.question === newEntry.question && entry.answer === newEntry.answer)
          })
          
          if (isDuplicate) {
            console.log('Preventing duplicate conversation history entry:', newEntry)
            return prev
          }
          
          console.log('Adding new conversation history entry for question', questionNumber, ':', newEntry)
          return [...prev, newEntry]
        })
        
        setTotalScore(prev => prev + result.score)
        
        // Play follow-up question if we haven't reached the limit
        if (questionNumber < maxQuestions) {
          setTimeout(async () => {
            const nextQuestionNumber = questionNumber + 1
            // Double check to prevent overshooting
            if (nextQuestionNumber <= maxQuestions) {
              setQuestionNumber(nextQuestionNumber)
              setQuestionAudioReady(false)  // Reset audio ready state
              
              // Generate a new question with the correct question number
              await generateQuestion(nextQuestionNumber)
            } else {
              handlePhaseComplete()
            }
          }, 3000) // 3 second delay to show score
        } else {
          // Interview complete
          setTimeout(() => {
            handlePhaseComplete()
          }, 3000)
        }
      }
    } catch (error) {
      console.error('Error scoring answer:', error)
    } finally {
      setIsScoring(false)
      setProcessingTranscript(null)
    }
  }

  const skipQuestion = async () => {
    // Prevent multiple skip calls
    if (isGeneratingQuestion || generatingQuestionRef.current !== null) {
      console.log('Already processing question transition, ignoring skip')
      return
    }
    
    try {
      // Save the skipped question to prevent it from being asked again
      if (currentQuestion) {
        console.log('Saving skipped question to conversation history')
        await fetch('/api/interview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            action: 'score_answer',
            transcript: 'QUESTION_SKIPPED',
            questionContext: currentQuestion,
          })
        })
      }
    } catch (error) {
      console.error('Error saving skipped question:', error)
    }
    
    // Reset current answer and processing states
    setCurrentAnswer(null)
    setIsScoring(false)
    setProcessingTranscript(null)
    setNoSpeechAlertShown(false) // Reset for next question
    
    if (questionNumber < maxQuestions) {
      const nextQuestionNumber = questionNumber + 1
      // Double check to prevent overshooting  
      if (nextQuestionNumber <= maxQuestions) {
        setQuestionNumber(nextQuestionNumber)
        setQuestionAudioReady(false)  // Reset audio ready state
        await generateQuestion(nextQuestionNumber)
      } else {
        handlePhaseComplete()
      }
    } else {
      handlePhaseComplete()
    }
  }

  const handleNoSpeechDetected = () => {
    if (!noSpeechAlertShown) {
      setNoSpeechAlertShown(true)
      alert('No speech detected. Please try again.')
      skipQuestion()
    } else {
      console.log('No speech alert already shown for this question, skipping duplicate')
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        {showInstructions ? (
          <div className="text-center">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Phase 1: Voice Interview</h2>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-left max-w-2xl mx-auto">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">Instructions</h3>
                <ul className="space-y-2 text-blue-800">
                  <li>• You will answer <strong>8 questions</strong> about Excel concepts and data analysis</li>
                  <li>• For each question, you will have <strong>15 seconds to think</strong>, then <strong>30 seconds to record</strong> your answer</li>
                  <li>• The recording will start automatically after the thinking time</li>
                  <li>• You can stop recording early by clicking the "Stop Recording" button</li>
                  <li>• Speak clearly and provide detailed explanations</li>
                  <li>• Your responses will be transcribed and evaluated</li>
                </ul>
              </div>
            </div>
            <button
              onClick={() => setShowInstructions(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-md text-lg"
            >
              Start Voice Interview
            </button>
          </div>
        ) : (
          <>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Voice Interview</h2>
          <div className="flex justify-between items-center">
            <p className="text-gray-600">Question {questionNumber} of {maxQuestions}</p>
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

        {/* Timed Audio Recorder */}
        <div className="mb-8">
          {!questionAudioReady && currentQuestion && (
            <div className="flex items-center justify-center space-x-2 p-4">
              <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
              <p className="text-blue-600">Please wait while the question is being read to you...</p>
            </div>
          )}
          <TimedAudioRecorder 
            key={`recorder-${questionNumber}-${currentQuestion?.id || 'none'}`}
            sessionId={sessionId}
            onTranscriptReceived={onTranscriptReceived}
            isEnabled={!!currentQuestion && !isGeneratingQuestion && !currentAnswer && questionAudioReady}
            currentQuestion={currentQuestion?.text || null}
            onRecordingComplete={() => {
              // Optional: Add any post-recording logic here
            }}
            onNoSpeechDetected={handleNoSpeechDetected}
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
                  <p className="text-green-700">Saving and evaluating your response...</p>
                </div>
              ) : currentAnswer.score !== undefined ? (
                <div>
                  <p className="text-sm font-medium text-green-900">
                    Your response has been recorded and evaluated.
                  </p>
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
          
          {questionNumber >= maxQuestions && !isScoring && !phaseCompleted && (
            <button
              onClick={handlePhaseComplete}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md"
            >
              Continue to Excel Task
            </button>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  )
}