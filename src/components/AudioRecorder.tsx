'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface AudioRecorderProps {
  sessionId: string
  onTranscriptReceived: (transcript: string, eventId: string) => void
  isEnabled: boolean
}

// Check if Web Speech API is supported
const isWebSpeechSupported = typeof window !== 'undefined' && 
  'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

export default function AudioRecorder({ sessionId, onTranscriptReceived, isEnabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [useWebSpeech, setUseWebSpeech] = useState(isWebSpeechSupported)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    // Initialize Web Speech API if available
    if (isWebSpeechSupported && useWebSpeech) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'
      
      recognition.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript
        console.log('Web Speech API transcript:', transcript)
        
        setIsRecording(false)
        setIsProcessing(true)
        
        // Send transcript to STT API for saving to database
        await processTranscript(transcript)
      }
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        setIsRecording(false)
        setIsProcessing(false)
        onTranscriptReceived(`Speech recognition error: ${event.error}`, `error-${Date.now()}`)
      }
      
      recognition.onend = () => {
        setIsRecording(false)
        setIsProcessing(false)
      }
      
      recognitionRef.current = recognition
    }
  }, [useWebSpeech, onTranscriptReceived])

  const startRecording = useCallback(async () => {
    if (!isEnabled || isRecording) return

    // Use Web Speech API if available and enabled
    if (useWebSpeech && recognitionRef.current) {
      try {
        setIsRecording(true)
        setIsProcessing(false)
        recognitionRef.current.start()
        return
      } catch (error) {
        console.error('Web Speech API error:', error)
        setUseWebSpeech(false) // Fallback to audio recording
      }
    }

    // Fallback to traditional audio recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      })
      
      streamRef.current = stream
      chunksRef.current = []

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length > 0) {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
          await processAudio(audioBlob)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Failed to start recording. Please check microphone permissions.')
    }
  }, [isEnabled, isRecording, sessionId])

  const stopRecording = useCallback(() => {
    if (!isRecording) return

    // Stop Web Speech API if it's being used
    if (useWebSpeech && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    // Stop MediaRecorder if it's being used
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsProcessing(true)

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      }
    }
  }, [isRecording, useWebSpeech])

  const processAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData()
      
      // Convert webm to wav for better compatibility with Whisper
      const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' })
      
      formData.append('audio', audioFile)
      formData.append('sessionId', sessionId)

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`STT API error: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success && result.transcript) {
        onTranscriptReceived(result.transcript, result.eventId)
      } else {
        console.error('No transcript received:', result)
      }
    } catch (error) {
      console.error('Error processing audio:', error)
      alert('Failed to process audio. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const processTranscript = async (transcript: string) => {
    try {
      const formData = new FormData()
      
      // For Web Speech API, we send the transcript as text
      const transcriptBlob = new Blob([transcript], { type: 'text/plain' })
      const transcriptFile = new File([transcriptBlob], 'transcript.txt', { type: 'text/plain' })
      
      formData.append('audio', transcriptFile)
      formData.append('sessionId', sessionId)
      formData.append('useWebSpeech', 'true')

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`STT API error: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success && result.transcript) {
        onTranscriptReceived(result.transcript, result.eventId)
      } else {
        console.error('No transcript received:', result)
      }
    } catch (error) {
      console.error('Error processing transcript:', error)
      alert('Failed to process transcript. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Auto-stop recording after 30 seconds
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleStartRecording = () => {
    startRecording()
    
    // Auto-stop after 30 seconds
    recordingTimeoutRef.current = setTimeout(() => {
      if (isRecording) {
        stopRecording()
      }
    }, 30000)
  }

  const handleStopRecording = () => {
    stopRecording()
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
    }
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      {/* Speech Recognition Method Indicator */}
      <div className="text-sm text-gray-600">
        {useWebSpeech ? (
          <span className="text-green-600">✓ Using Browser Speech Recognition (Free)</span>
        ) : (
          <span className="text-yellow-600">⚠ Using Audio Upload (Quota Limited)</span>
        )}
      </div>
      
      <div className="flex items-center space-x-4">
        {!isRecording && !isProcessing && (
          <button
            onClick={handleStartRecording}
            disabled={!isEnabled}
            className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-6 rounded-full flex items-center space-x-2"
          >
            <span className="w-3 h-3 bg-white rounded-full"></span>
            <span>Start Recording</span>
          </button>
        )}
        
        {isRecording && (
          <button
            onClick={handleStopRecording}
            className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded-full flex items-center space-x-2 animate-pulse"
          >
            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
            <span>Stop Recording</span>
          </button>
        )}
        
        {isProcessing && (
          <div className="bg-blue-500 text-white font-medium py-2 px-6 rounded-full flex items-center space-x-2">
            <div className="w-3 h-3 bg-white rounded-full animate-spin"></div>
            <span>Processing...</span>
          </div>
        )}
      </div>
      
      <div className="text-sm text-gray-600 text-center">
        {isRecording && (
          <p className="text-red-600 font-medium">🔴 Recording... (max 30 seconds)</p>
        )}
        {isProcessing && (
          <p className="text-blue-600">Processing your audio...</p>
        )}
        {!isRecording && !isProcessing && isEnabled && (
          <p>Click to record your answer</p>
        )}
        {!isEnabled && (
          <p className="text-gray-400">Recording disabled</p>
        )}
      </div>
    </div>
  )
}
