'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface TimedAudioRecorderProps {
  sessionId: string
  onTranscriptReceived: (transcript: string, eventId: string) => void
  isEnabled: boolean
  currentQuestion: string | null
  onRecordingComplete?: () => void
  onNoSpeechDetected?: () => void
}

// Check if Web Speech API is supported
const getWebSpeechSupport = () => {
  if (typeof window === 'undefined') return false
  
  // Check HTTPS requirement
  const isHTTPS = window.location.protocol === 'https:' || window.location.hostname === 'localhost'
  const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  
  console.log('Speech Recognition Support Check:', {
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    isHTTPS,
    hasSpeechRecognition,
    userAgent: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Other'
  })
  
  if (!isHTTPS) {
    console.warn('Speech Recognition requires HTTPS or localhost')
    return false
  }
  
  if (!hasSpeechRecognition) {
    console.warn('Speech Recognition API not available in this browser')
    return false
  }
  
  return true
}

export default function TimedAudioRecorder({ 
  sessionId, 
  onTranscriptReceived, 
  isEnabled, 
  currentQuestion,
  onRecordingComplete,
  onNoSpeechDetected
}: TimedAudioRecorderProps) {
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'recording' | 'processing'>('idle')
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [isWebSpeechSupported, setIsWebSpeechSupported] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [canStopManually, setCanStopManually] = useState(false)
  
  const recognitionRef = useRef<any>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const finalTranscriptRef = useRef('')
  const noSpeechCallbackFiredRef = useRef(false)

  // Initialize web speech support on client side
  useEffect(() => {
    setIsWebSpeechSupported(getWebSpeechSupport())
  }, [])

  // Auto-start sequence when a new question is provided
  useEffect(() => {
    console.log('TimedAudioRecorder useEffect triggered:', { 
      isEnabled, 
      currentQuestion: currentQuestion?.substring(0, 50) + '...', 
      isWebSpeechSupported 
    })
    
    if (isEnabled && currentQuestion && isWebSpeechSupported) {
      // Reset all state when a new question starts
      finalTranscriptRef.current = ''
      setTranscript('')
      noSpeechCallbackFiredRef.current = false // Reset callback flag for new question
      setPhase('idle')
      setTimeRemaining(0)
      setCanStopManually(false)
      
      startTimedSequence()
    }
    
    return () => {
      console.log('TimedAudioRecorder cleanup triggered')
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
    }
  }, [isEnabled, currentQuestion, isWebSpeechSupported])

  const startTimedSequence = () => {
    console.log('Starting timed sequence for question:', currentQuestion)
    
    // Complete reset of all recording state
    setPhase('thinking')
    setTimeRemaining(15)
    finalTranscriptRef.current = '' // Clear the ref
    setTranscript('') // Clear the state
    noSpeechCallbackFiredRef.current = false // Reset callback flag for new question
    setCanStopManually(false)
    
    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    
    // Clear any existing timers
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    console.log('State reset complete, starting thinking phase')
    
    // 15-second thinking phase
    const thinkingTimer = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = prev - 1
        console.log('Thinking timer tick:', prev, '→', newTime)
        if (prev <= 1) {
          clearInterval(thinkingTimer)
          startRecording()
          return 0
        }
        return newTime
      })
    }, 1000)
    
    timerRef.current = thinkingTimer
  }

  const startRecording = () => {
    if (!isWebSpeechSupported) return
    
    // Clear any existing timer before starting recording phase
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    setPhase('recording')
    setTimeRemaining(30)
    setCanStopManually(true)
    
    console.log('Starting recording phase with 30 second timer')
    
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      
      recognition.onresult = (event: any) => {
        let interimTranscript = ''
        let finalTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }
        
        if (finalTranscript) {
          finalTranscriptRef.current += finalTranscript
          console.log('Final transcript received:', finalTranscript)
          console.log('Total final transcript:', finalTranscriptRef.current)
        }
        
        setTranscript(finalTranscriptRef.current + interimTranscript)
      }
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        
        // Handle different error types with user-friendly messages
        switch (event.error) {
          case 'not-allowed':
            alert('🎤 Microphone access denied. Please:\n1. Click the microphone icon in your browser bar\n2. Allow microphone access\n3. Refresh the page and try again')
            break
          case 'no-speech':
            console.log('No speech detected, will continue listening...')
            break
          case 'audio-capture':
            alert('🎤 Microphone not found or not working. Please check your microphone connection.')
            break
          case 'network':
            console.warn('Speech recognition network error, will retry...')
            break
          case 'service-not-allowed':
            alert('⚠️ Speech recognition not available. This feature requires HTTPS connection.')
            break
          default:
            console.warn(`Speech recognition error: ${event.error}`)
        }
      }
      
      recognition.onend = () => {
        console.log('Speech recognition ended, phase:', phase)
        if (phase === 'recording' && recognitionRef.current) {
          // Only restart if we still have a valid reference and we're still in recording phase
          try {
            recognition.start()
            console.log('Speech recognition restarted')
          } catch (error) {
            console.log('Recognition restart failed:', error)
          }
        }
      }
      
      recognitionRef.current = recognition
      recognition.start()
      
      // 30-second recording timer
      const recordingTimer = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1
          console.log('Recording timer tick:', prev, '→', newTime)
          if (prev <= 1) {
            clearInterval(recordingTimer)
            stopRecording()
            return 0
          }
          return newTime
        })
      }, 1000)
      
      timerRef.current = recordingTimer
      
    } catch (error) {
      console.error('Failed to start speech recognition:', error)
      setPhase('idle')
    }
  }

  const stopRecording = useCallback(() => {
    console.log('stopRecording called')
    
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      console.log('Speech recognition stopped and reference cleared')
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    setPhase('processing')
    setCanStopManually(false)
    
    // Give speech recognition a moment to process final results
    setTimeout(() => {
      // Get fresh transcript values at the time of processing
      const finalText = finalTranscriptRef.current.trim()
      
      console.log('Checking transcripts:', { 
        finalText,
        currentQuestion,
        callbackFired: noSpeechCallbackFiredRef.current
      })
      
      // Only use speech that was captured during THIS recording session
      if (finalText && finalText.length > 0) {
        console.log('Valid speech detected:', finalText)
        // Update state with the fresh transcript
        setTranscript(finalText)
        processTranscript(finalText)
      } else {
        console.log('No speech detected for this question')
        setPhase('idle')
        if (!noSpeechCallbackFiredRef.current) {
          noSpeechCallbackFiredRef.current = true
          console.log('Notifying parent - no speech detected')
          // Only notify parent component once, don't show alert here
          onNoSpeechDetected?.()
        } else {
          console.log('No speech callback already fired, skipping duplicate')
        }
      }
    }, 500) // 500ms delay to allow speech recognition to finalize
  }, [onNoSpeechDetected, currentQuestion])

  const processTranscript = async (text: string) => {
    try {
      // Send to STT API for processing
      const response = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          transcript: text,
          timestamp: new Date().toISOString()
        })
      })

      if (response.ok) {
        const result = await response.json()
        onTranscriptReceived(text, result.eventId || 'web-speech')
        onRecordingComplete?.()
      }
    } catch (error) {
      console.error('Error processing transcript:', error)
    } finally {
      setPhase('idle')
    }
  }

  const formatTime = (seconds: number): string => {
    return `${seconds}s`
  }

  const getPhaseMessage = () => {
    switch (phase) {
      case 'thinking':
        return 'Think about your answer...'
      case 'recording':
        return 'Speak your answer now'
      case 'processing':
        return 'Processing your response...'
      default:
        return 'Waiting for next question...'
    }
  }

  const getPhaseColor = () => {
    switch (phase) {
      case 'thinking':
        return 'bg-yellow-100 text-yellow-800'
      case 'recording':
        return 'bg-green-100 text-green-800'
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  if (!isWebSpeechSupported) {
    const isHTTPS = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')
    const hasAPI = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
    
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <h3 className="text-red-800 font-medium mb-2">🎤 Speech Recognition Not Available</h3>
        <div className="text-red-700 text-sm space-y-1">
          {!isHTTPS && (
            <p>• This feature requires HTTPS connection (you're on HTTP)</p>
          )}
          {!hasAPI && (
            <p>• Please use Chrome, Edge, or Safari for voice recognition</p>
          )}
          <p className="mt-2 font-medium">
            Alternative: You can type your responses instead of speaking them.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="text-center">
        <div className={`inline-flex items-center px-4 py-3 rounded-lg font-medium text-lg ${getPhaseColor()}`}>
          <div className="flex items-center">
            {phase === 'recording' && (
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-3"></div>
            )}
            {phase === 'thinking' && (
              <svg className="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            )}
            {phase === 'processing' && (
              <div className="w-5 h-5 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            )}
            
            <span>{getPhaseMessage()}</span>
            
            {(phase === 'thinking' || phase === 'recording') && (
              <span className="ml-3 font-mono">
                {formatTime(timeRemaining)}
              </span>
            )}
          </div>
        </div>
        
        {phase === 'recording' && canStopManually && (
          <button
            onClick={stopRecording}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
          >
            Stop Recording
          </button>
        )}
        
        {transcript && (
          <div className="mt-4 p-4 bg-gray-50 rounded-md text-left">
            <h4 className="font-medium text-gray-900 mb-2">Your Response:</h4>
            <p className="text-gray-700 italic">"{transcript}"</p>
          </div>
        )}
      </div>
    </div>
  )
}