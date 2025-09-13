'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@/lib/supabase'
import VoiceInterview from '@/components/VoiceInterview'
import ExcelTask from '@/components/ExcelTask'
import FaceDetection from '@/components/FaceDetection'
import ScreenRecording from '@/components/ScreenRecording'

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
  const [currentPhase, setCurrentPhase] = useState<'setup' | 'voice_interview' | 'excel_task' | 'completed'>('setup')
  const [introductionComplete, setIntroductionComplete] = useState(false)
  const [firstQuestion, setFirstQuestion] = useState<string>('')

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
      
      // Start monitoring for tab switches and focus changes - DISABLED FOR PERFORMANCE
      // startScreenMonitoring()

    } catch (error) {
      console.error('Permission request failed:', error)
      alert('Media permissions are required for the interview. Please refresh and allow access.')
    } finally {
      setIsLoading(false)
    }
  }

  const logScreenShareEvent = async (eventType: string) => {
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
            source: 'screen_monitoring'
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
      setCurrentPhase('voice_interview')
      
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
      
      // First, generate the first question while playing introduction
      console.log('Generating first question...')
      const questionResponse = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession?.id,
          action: 'generate_question',
          questionNumber: 1,
          difficulty: 'intermediate'
        })
      })

      let generatedQuestion = 'What is the difference between VLOOKUP and INDEX-MATCH functions in Excel?'
      
      console.log('Question response status:', questionResponse.status)
      if (questionResponse.ok) {
        const questionResult = await questionResponse.json()
        console.log('Question result:', questionResult)
        if (questionResult.success) {
          generatedQuestion = questionResult.question
        }
      } else {
        console.error('Question generation failed:', await questionResponse.text())
      }

      setFirstQuestion(generatedQuestion)
      console.log('First question set:', generatedQuestion)

      // Now play introduction with the first question ready
      console.log('Playing introduction with TTS...')
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Hello ${candidateName}! I'm your AI interviewer today. We'll start with some conceptual Excel questions, then move to a practical task. Please speak clearly and take your time with your answers. Are you ready to begin? Here's your first question: ${generatedQuestion}`
        })
      })
      
      console.log('TTS response status:', response.status)
      if (response.ok) {
        const data = await response.json()
        console.log('TTS data:', data)
        if (data.audioUrl) {
          console.log('Playing audio from URL:', data.audioUrl)
          const audio = new Audio(data.audioUrl)
          await audio.play()
          console.log('Audio finished playing')
          // Mark introduction as complete after audio finishes playing
          setIntroductionComplete(true)
        } else {
          console.warn('No audioUrl in TTS response')
          setIntroductionComplete(true)
        }
      } else {
        console.error('TTS failed:', await response.text())
        // Don't wait for TTS, proceed with interview
        alert(`Introduction: Hello ${candidateName}! I'm your AI interviewer today. Here's your first question: ${generatedQuestion}`)
        setIntroductionComplete(true)
      }
    } catch (error) {
      console.error('Failed to play introduction:', error)
      // Even if TTS fails, allow interview to proceed with fallback question
      setFirstQuestion('What is the difference between VLOOKUP and INDEX-MATCH functions in Excel?')
      setIntroductionComplete(true)
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
              <button
                onClick={startInterview}
                disabled={isLoading || !candidateName.trim() || !candidateEmail.trim()}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Starting Interview...' : 'Start Interview'}
              </button>
            )}
            
            {/* Testing Shortcut - Remove in production */}
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
                currentPhase === 'voice_interview' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
              }`}>
                Voice Interview
              </span>
              <span className={`px-3 py-1 rounded-full text-sm ${
                currentPhase === 'excel_task' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
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
            
            {/* Proctoring components - DISABLED FOR PERFORMANCE */}
            {/* 
            <FaceDetection 
              sessionId={session?.id || ''}
              videoStream={mediaStreamRef.current}
              isActive={currentPhase === 'voice_interview' || currentPhase === 'excel_task'}
            />
            */}
            
            {/* Screen Recording - DISABLED FOR PERFORMANCE */}
            {/*
            <ScreenRecording
              sessionId={session?.id || ''}
              screenStream={screenStreamRef.current}
              isActive={currentPhase === 'voice_interview' || currentPhase === 'excel_task'}
            />
            */}
          </div>

          {/* Phase-specific content */}
          {currentPhase === 'voice_interview' && session && (
            <VoiceInterview 
              sessionId={session.id}
              onPhaseComplete={() => setCurrentPhase('excel_task')}
              shouldStartInterview={introductionComplete}
              firstQuestion={firstQuestion}
            />
          )}
          
          {currentPhase === 'excel_task' && session && (
            <ExcelTask
              sessionId={session.id}
              onPhaseComplete={() => setCurrentPhase('completed')}
            />
          )}
          
          {currentPhase === 'completed' && session && (
            <div className="text-center py-8">
              <h2 className="text-2xl font-bold text-green-600 mb-4">Interview Completed!</h2>
              <p className="text-gray-600 mb-4">
                Thank you for completing the Excel skills assessment.
              </p>
              <p className="text-sm text-gray-500">Session ID: {session.id}</p>
              <div className="mt-6">
                <p className="text-gray-600">
                  Your responses are being processed. The recruiter will review your performance and get back to you soon.
                </p>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId: session.id })
                      })
                      if (response.ok) {
                        console.log('Report generated successfully')
                      }
                    } catch (error) {
                      console.error('Report generation failed:', error)
                    }
                  }}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md"
                >
                  Generate Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}