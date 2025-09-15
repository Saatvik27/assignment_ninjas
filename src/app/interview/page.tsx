'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@/lib/supabase'
import VoiceInterview from '@/components/VoiceInterview'
import ExcelTask from '@/components/ExcelTask'
import FaceDetection from '@/components/FaceDetection'
import ScreenRecording from '@/components/ScreenRecording'
import CompletionSummary from '@/components/CompletionSummary'

interface MediaPermissions {
  camera: boolean
  microphone: boolean
  screen: boolean
}

export default function InterviewPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [permissions, setPermissions] = useState<MediaPermissions>({
    camera: false,
    microphone: false,
    screen: false
  })
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<'setup' | 'intro_audio' | 'voice_interview' | 'excel_task' | 'completed'>('setup')
  const [introductionComplete, setIntroductionComplete] = useState(false)
  const [showVoiceInstructions, setShowVoiceInstructions] = useState(false)
  const [firstQuestion, setFirstQuestion] = useState<string>('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)

  // Request media permissions
  const requestPermissions = async () => {
    setIsLoading(true)
    try {
      // Request camera and microphone
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })
      
      mediaStreamRef.current = mediaStream
      
      // Set permissions first to ensure video element is rendered
      setPermissions(prev => ({ ...prev, camera: true, microphone: true }))
      
      // Use a small delay to ensure React has rendered the video element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          videoRef.current.play().catch(() => {
            // Video autoplay prevented, but that's ok
          })
        }
      }, 100)

      // Request screen recording permission with strict constraints  
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor', // Prefer entire screen
        },
        audio: false
      })
      
      // Validate that user shared entire screen (not just a window/tab)
      const videoTrack = screenStream.getVideoTracks()[0]
      const settings = videoTrack.getSettings()
      
      console.log('Screen share settings:', settings)
      
      // Check if it's likely a full screen (usually larger dimensions)
      if (settings.width && settings.height) {
        const isLikelyFullScreen = settings.width >= 1024 && settings.height >= 768
        
        if (!isLikelyFullScreen) {
          alert('Please share your entire screen (not just a window or tab) for the interview.')
          screenStream.getTracks().forEach(track => track.stop())
          return
        }
      }
      
      // Monitor screen share for changes/disconnections
      videoTrack.onended = () => {
        console.log('Screen share ended - user stopped sharing')
        setPermissions(prev => ({ ...prev, screen: false }))
        // Log proctoring violation
        logScreenShareEvent('screen_share_stopped')
      }
      
      screenStreamRef.current = screenStream
      setPermissions(prev => ({ ...prev, screen: true }))
      
      // Start monitoring for tab switches and focus changes - RE-ENABLED with fullscreen
      // Note: This is now enabled since we have fullscreen mode active
      // startScreenMonitoring() will be called after fullscreen is activated in startInterview()

    } catch (error) {
      console.error('Permission request failed:', error)
      alert('Media permissions are required for the interview. Please refresh and allow access.')
    } finally {
      setIsLoading(false)
    }
  }

  const logScreenShareEvent = async (eventType: string, additionalData?: any) => {
    if (!session?.id) return

    try {
      await fetch('/api/proctoring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session.id,
          eventType,
          confidence: 1.0,
          metadata: {
            timestamp: new Date().toISOString(),
            source: 'screen_monitoring',
            ...additionalData
          }
        }),
      })
    } catch (error) {
      console.error('Failed to log screen share event:', error)
    }
  }

  const startScreenMonitoring = () => {
    // Monitor page visibility changes (tab switching)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('User switched tabs or minimized window')
        logScreenShareEvent('tab_switch')
      } else {
        console.log('User returned to interview tab')
        logScreenShareEvent('tab_return')
      }
    }

    // Monitor window focus changes
    const handleWindowBlur = () => {
      console.log('Window lost focus')
      logScreenShareEvent('window_blur')
    }

    const handleWindowFocus = () => {
      console.log('Window gained focus')
      logScreenShareEvent('window_focus')
    }

    // Monitor fullscreen changes
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        console.log('User exited fullscreen')
        logScreenShareEvent('fullscreen_exit')
      }
    }

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    // Return cleanup function
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }

  // Create interview session
  const startInterview = async () => {
    if (!candidateName.trim() || !candidateEmail.trim()) {
      alert('Please enter your name and email')
      return
    }

    if (!permissions.camera || !permissions.microphone || !permissions.screen) {
      alert('All media permissions are required to start the interview')
      return
    }

    setIsLoading(true)
    
    try {
      // Request fullscreen mode before starting interview
      try {
        await document.documentElement.requestFullscreen()
        console.log('Entered fullscreen mode')
      } catch (fullscreenError) {
        console.warn('Fullscreen request failed:', fullscreenError)
        // Don't block interview if fullscreen fails, but warn user
        const proceedAnyway = confirm('Fullscreen mode could not be activated. This may affect the interview experience. Do you want to proceed anyway?')
        if (!proceedAnyway) {
          setIsLoading(false)
          return
        }
      }
      
      console.log('Creating session for:', candidateName, candidateEmail)
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          status: 'in_progress'
        })
        .select()
        .single()

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }

      console.log('Session created:', data)
      setSession(data)
      setCurrentPhase('intro_audio')
      
      // Enable proctoring monitoring after fullscreen is active
      startScreenMonitoring()
      
      // Play AI introduction with the session data directly
      await playIntroduction(data)
      
    } catch (error) {
      console.error('Failed to create session:', error)
      alert('Failed to start interview. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const playIntroduction = async (sessionData?: any) => {
    try {
      const currentSession = sessionData || session
      console.log('Starting introduction with session:', currentSession?.id)
      
      // Start generating the first question in the background (don't wait)
      console.log('Starting first question generation in background...')
      fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession?.id,
          action: 'generate_question',
          questionNumber: 1,
          difficulty: 'intermediate'
        })
      }).then(async (questionResponse) => {
        console.log('Question response status:', questionResponse.status)
        if (questionResponse.ok) {
          const questionResult = await questionResponse.json()
          console.log('Question result:', questionResult)
          if (questionResult.success) {
            setFirstQuestion(questionResult.question)
            console.log('First question set:', questionResult.question)
          }
        } else {
          console.error('Question generation failed:', await questionResponse.text())
          setFirstQuestion('What is the difference between VLOOKUP and INDEX-MATCH functions in Excel?')
        }
      }).catch(error => {
        console.error('Question generation error:', error)
        setFirstQuestion('What is the difference between VLOOKUP and INDEX-MATCH functions in Excel?')
      })

      // Play introduction immediately (don't wait for question generation)
      console.log('Playing introduction with TTS...')
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Hello ${candidateName}! I'm your AI interviewer today. We'll start with some conceptual Excel questions, then move to a practical task. Please speak clearly and take your time with your answers. After this introduction, you'll see instructions for Phase 1. Good luck!`,
          speechRate: 0.75  // Slow down intro as well
        })
      })
      
      console.log('TTS response status:', response.status)
      if (response.ok) {
        const data = await response.json()
        console.log('TTS data:', data)
        if (data.audioUrl) {
          console.log('Playing audio from URL:', data.audioUrl)
          const audio = new Audio(data.audioUrl)
          // Wait for audio to actually finish playing before proceeding
          await new Promise((resolve) => {
            audio.onended = resolve
            audio.onerror = resolve // Also resolve on error to prevent hanging
            audio.play()
          })
          console.log('Audio finished playing')
          // Mark introduction as complete and show voice instructions button after audio finishes playing
          setIntroductionComplete(true)
          setShowVoiceInstructions(true)
        } else {
          console.warn('No audioUrl in TTS response')
          setIntroductionComplete(true)
          setShowVoiceInstructions(true)
        }
      } else {
        console.error('TTS failed:', await response.text())
        // Don't wait for TTS, proceed with interview
        alert(`Introduction: Hello ${candidateName}! I'm your AI interviewer today. We'll start with some conceptual Excel questions, then move to a practical task. Please speak clearly and take your time with your answers.`)
        setIntroductionComplete(true)
        setShowVoiceInstructions(true)
      }
    } catch (error) {
      console.error('Failed to play introduction:', error)
      // Even if TTS fails, allow interview to proceed with fallback question
      setFirstQuestion('What is the difference between VLOOKUP and INDEX-MATCH functions in Excel?')
      setIntroductionComplete(true)
      setShowVoiceInstructions(true)
    }
  }

  // Cleanup media streams
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Reassign video stream when phase changes or video element changes
  useEffect(() => {
    if (mediaStreamRef.current && videoRef.current && permissions.camera) {
      videoRef.current.srcObject = mediaStreamRef.current
      videoRef.current.play().catch(() => {
        // Video play prevented, but that's ok
      })
    }
  }, [currentPhase, permissions.camera])

  // Monitor fullscreen status changes and comprehensive proctoring
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement
      setIsFullscreen(isCurrentlyFullscreen)
      
      if (!isCurrentlyFullscreen) {
        console.log('User exited fullscreen')
        if (session) {
          logScreenShareEvent('fullscreen_exit')
        }
        
        // Show warning to user about fullscreen exit
        if (currentPhase === 'voice_interview' || currentPhase === 'excel_task') {
          alert('⚠️ You have exited fullscreen mode. Please press F11 or click the "Enter" button to re-enter fullscreen mode for the interview.')
        }
      } else {
        console.log('User entered fullscreen mode')
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // F11 key for fullscreen toggle
      if (event.key === 'F11' && (currentPhase === 'voice_interview' || currentPhase === 'excel_task')) {
        event.preventDefault()
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          document.documentElement.requestFullscreen()
        }
      }

      // Enhanced proctoring: Log suspicious key combinations
      if (currentPhase === 'voice_interview' || currentPhase === 'excel_task') {
        const suspiciousKeys = [
          { condition: event.altKey && event.key === 'Tab', name: 'Alt+Tab' },
          { condition: event.ctrlKey && event.key === 'Tab', name: 'Ctrl+Tab' },
          { condition: event.ctrlKey && event.shiftKey && event.key === 'Tab', name: 'Ctrl+Shift+Tab' },
          { condition: event.ctrlKey && event.key === 't', name: 'Ctrl+T (New Tab)' },
          { condition: event.ctrlKey && event.key === 'n', name: 'Ctrl+N (New Window)' },
          { condition: event.ctrlKey && event.key === 'w', name: 'Ctrl+W (Close Tab)' },
          { condition: event.metaKey && event.key === 'Tab', name: 'Cmd+Tab' }, // Mac
          { condition: event.metaKey && event.key === '`', name: 'Cmd+` (App Switcher)' } // Mac
        ]

        suspiciousKeys.forEach(({ condition, name }) => {
          if (condition) {
            console.warn(`Suspicious key combination detected: ${name}`)
            if (session) {
              logScreenShareEvent('suspicious_key_combo', { key_combination: name })
            }
          }
        })
      }
    }

      // Enhanced proctoring: Tab switching detection
    const handleVisibilityChange = () => {
      if (currentPhase === 'voice_interview' || currentPhase === 'excel_task') {
        if (document.visibilityState === 'hidden') {
          // Critical security log - keep this
          console.warn('Tab switched or window minimized during interview')
          if (session) {
            logScreenShareEvent('tab_switch_away')
          }
        } else if (document.visibilityState === 'visible') {
          // Removed non-critical log for performance
          if (session) {
            logScreenShareEvent('tab_switch_back')
          }
        }
      }
    }

    // Enhanced proctoring: Window focus monitoring
    const handleWindowBlur = () => {
      if (currentPhase === 'voice_interview' || currentPhase === 'excel_task') {
        // Critical security log - keep this
        console.warn('Interview window lost focus')
        if (session) {
          logScreenShareEvent('window_blur')
        }
      }
    }

    const handleWindowFocus = () => {
      if (currentPhase === 'voice_interview' || currentPhase === 'excel_task') {
        // Removed non-critical log for performance
        if (session) {
          logScreenShareEvent('window_focus')
        }
      }
    }

    // Enhanced proctoring: Mouse leave detection (user moved to another screen/app)
    const handleMouseLeave = () => {
      if (currentPhase === 'voice_interview' || currentPhase === 'excel_task') {
        // Reduced logging for performance - only log to database
        if (session) {
          logScreenShareEvent('mouse_leave')
        }
      }
    }

    const handleMouseEnter = () => {
      if (currentPhase === 'voice_interview' || currentPhase === 'excel_task') {
        // Removed non-critical log for performance
        if (session) {
          logScreenShareEvent('mouse_enter')
        }
      }
    }    // Add all event listeners for comprehensive proctoring
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseenter', handleMouseEnter)
    
    // Set initial state
    setIsFullscreen(!!document.fullscreenElement)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('mouseenter', handleMouseEnter)
    }
  }, [currentPhase, session])

  if (currentPhase === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Excel Skills Interview
          </h1>
          
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your full name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your email"
              />
            </div>
          </div>

          {/* Permission Status */}
          <div className="space-y-2 mb-6">
            <h3 className="font-medium text-gray-900">Required Permissions:</h3>
            <div className="space-y-1">
              <div className={`flex items-center ${permissions.camera ? 'text-green-600' : 'text-gray-500'}`}>
                <span className="text-sm">📹 Camera Access</span>
                {permissions.camera && <span className="ml-2 text-xs">✓</span>}
              </div>
              <div className={`flex items-center ${permissions.microphone ? 'text-green-600' : 'text-gray-500'}`}>
                <span className="text-sm">🎤 Microphone Access</span>
                {permissions.microphone && <span className="ml-2 text-xs">✓</span>}
              </div>
              <div className={`flex items-center ${permissions.screen ? 'text-green-600' : 'text-gray-500'}`}>
                <span className="text-sm">🖥️ Screen Recording</span>
                {permissions.screen && <span className="ml-2 text-xs">✓</span>}
              </div>
            </div>
          </div>

          {/* Video Preview */}
          {permissions.camera && (
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Camera Preview:</p>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-32 bg-gray-200 border-2 border-gray-300 rounded-md"
                style={{ 
                  objectFit: 'cover'
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                If you don't see your video, check browser permissions and console for errors.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {!permissions.camera || !permissions.microphone || !permissions.screen ? (
              <button
                onClick={requestPermissions}
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Requesting Permissions...' : 'Grant Media Permissions'}
              </button>
            ) : (
              <>
                {/* Fullscreen Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3">
                  <div className="flex items-start">
                    <div className="text-blue-600 mr-2">📺</div>
                    <div>
                      <h4 className="text-sm font-medium text-blue-900">Fullscreen Mode</h4>
                      <p className="text-xs text-blue-700 mt-1">
                        The interview will automatically enter fullscreen mode for security. 
                        You can press F11 or use the interface button if you exit fullscreen during the interview.
                      </p>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={startInterview}
                  disabled={isLoading || !candidateName.trim() || !candidateEmail.trim()}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Starting Interview...' : 'Start Interview'}
                </button>
              </>
            )}
            
            {/* Testing Shortcut - Remove in production */}
            {/*
            <button
              onClick={async () => {
                // Create a test session for Excel task testing
                if (!candidateName.trim()) setCandidateName('Test User')
                if (!candidateEmail.trim()) setCandidateEmail('test@example.com')
                
                try {
                  const { data, error } = await supabase
                    .from('sessions')
                    .insert({
                      candidate_name: candidateName || 'Test User',
                      candidate_email: candidateEmail || 'test@example.com', 
                      status: 'in_progress'
                    })
                    .select()
                    .single()

                  if (!error && data) {
                    setSession(data)
                    setCurrentPhase('excel_task')
                  }
                } catch (error) {
                  console.error('Failed to create test session:', error)
                }
              }}
              className="w-full bg-orange-500 text-white py-2 px-4 rounded-md hover:bg-orange-600 text-sm"
            >
              🧪 Skip to Excel Task (Testing)
            </button>
            */}
          </div>

          <div className="mt-4 text-xs text-gray-500 text-center">
            This interview will be recorded for evaluation purposes.
            <br />
            Please ensure you're in a quiet environment.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-xl font-bold mb-4">Interview in Progress - {candidateName}</h1>
          
          {/* Phase indicator */}
          <div className="mb-4">
            <div className="flex space-x-4">
              <span className={`px-3 py-1 rounded-full text-sm ${
                currentPhase === 'intro_audio' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'
              }`}>
                Introduction
              </span>
              <span className={`px-3 py-1 rounded-full text-sm ${
                currentPhase === 'voice_interview' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
              }`}>
                Voice Interview
              </span>
              <span className={`px-3 py-1 rounded-full text-sm ${
                currentPhase === 'excel_task' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                Excel Task
              </span>
              <span className={`px-3 py-1 rounded-full text-sm ${
                currentPhase === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                Completed
              </span>
            </div>
          </div>

          {/* Video preview with proctoring overlays */}
          <div className="mb-4 relative">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-48 h-36 bg-gray-200 border-2 border-gray-300 rounded-md"
              style={{ 
                objectFit: 'cover'
              }}
            />
            
            {/* Fullscreen Status Indicator */}
            {(currentPhase === 'voice_interview' || currentPhase === 'excel_task') && (
              <div className="absolute top-2 right-2">
                <div className={`flex items-center space-x-2 px-2 py-1 rounded-full text-xs font-medium ${
                  isFullscreen 
                    ? 'bg-green-100 text-green-800 border border-green-200' 
                    : 'bg-red-100 text-red-800 border border-red-200'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    isFullscreen ? 'bg-green-500' : 'bg-red-500 animate-pulse'
                  }`}></div>
                  <span>{isFullscreen ? 'Fullscreen' : 'Not Fullscreen'}</span>
                  {!isFullscreen && (
                    <button
                      onClick={async () => {
                        try {
                          await document.documentElement.requestFullscreen()
                        } catch (error) {
                          alert('Please press F11 to enter fullscreen mode')
                        }
                      }}
                      className="ml-1 px-2 py-0.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    >
                      Enter
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Proctoring components - DISABLED FOR PERFORMANCE */}
            {/* 
            <FaceDetection 
              sessionId={session?.id || ''}
              videoStream={mediaStreamRef.current}
              isActive={currentPhase === 'voice_interview' || currentPhase === 'excel_task'}
            />
            */}
            
            {/* Screen Recording - ENABLED with Performance Optimizations */}
            <ScreenRecording
              sessionId={session?.id || ''}
              screenStream={screenStreamRef.current}
              isActive={currentPhase === 'voice_interview' || currentPhase === 'excel_task'}
            />

            {/* Note: Audio recording is handled by TimedAudioRecorder inside VoiceInterview component */}
          </div>

          {/* Phase-specific content */}
          {currentPhase === 'intro_audio' && (
            <div className="max-w-2xl mx-auto text-center">
              <div className="bg-white rounded-lg shadow-lg p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Welcome to Your Interview</h2>
                
                {!introductionComplete ? (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
                      <p className="text-lg text-blue-600">Please listen to the introduction...</p>
                    </div>
                    <p className="text-gray-600">Your AI interviewer is providing important information about the interview process.</p>
                  </div>
                ) : showVoiceInstructions ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-lg text-green-600">Introduction complete!</p>
                    </div>
                    <p className="text-gray-600 mb-6">Now let's review the instructions for Phase 1 of your interview.</p>
                    <button
                      onClick={() => setCurrentPhase('voice_interview')}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-md text-lg"
                    >
                      Read Phase 1 Instructions
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600">Waiting...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentPhase === 'voice_interview' && session && (
            <VoiceInterview 
              sessionId={session.id}
              onPhaseComplete={() => {
                console.log('Voice interview completed, transitioning to Excel task')
                setCurrentPhase('excel_task')
              }}
              shouldStartInterview={introductionComplete}
              firstQuestion={firstQuestion}
            />
          )}
          
          {currentPhase === 'excel_task' && session && (
            <ExcelTask
              sessionId={session.id}
              onPhaseComplete={() => {
                // Update session status to completed and set end time
                const updateSessionCompletion = async () => {
                  try {
                    const { error } = await supabase
                      .from('sessions')
                      .update({
                        status: 'completed',
                        ended_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', session.id)
                    
                    if (error) {
                      console.error('Failed to update session completion:', error)
                    }
                  } catch (err) {
                    console.error('Session completion update error:', err)
                  }
                }
                
                updateSessionCompletion()
                setCurrentPhase('completed')
              }}
            />
          )}
          
          {currentPhase === 'completed' && session && (
            <CompletionSummary sessionId={session.id} />
          )}
        </div>
      </div>
    </div>
  )
}