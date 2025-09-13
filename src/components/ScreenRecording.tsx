'use client'

import { useRef, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ScreenRecordingProps {
  sessionId: string
  screenStream: MediaStream | null
  isActive: boolean
}

export default function ScreenRecording({ sessionId, screenStream, isActive }: ScreenRecordingProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSize, setRecordingSize] = useState(0)

  useEffect(() => {
    if (isActive && screenStream) {
      startRecording()
    } else if (!isActive && isRecording) {
      stopRecording()
    }

    return () => {
      if (mediaRecorderRef.current && isRecording) {
        stopRecording()
      }
    }
  }, [isActive, screenStream])

  const startRecording = () => {
    if (!screenStream || isRecording) return

    try {
      chunksRef.current = []
      
      const mediaRecorder = new MediaRecorder(screenStream, {
        mimeType: 'video/webm;codecs=vp8,opus'
      })

      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
          setRecordingSize(prev => prev + event.data.size)
        }
      }

      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length > 0) {
          await saveRecording()
        }
      }

      mediaRecorder.start(5000) // Collect data every 5 seconds
      setIsRecording(true)

    } catch (error) {
      console.error('Failed to start screen recording:', error)
    }
  }

  const stopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return

    mediaRecorderRef.current.stop()
    setIsRecording(false)
  }

  const saveRecording = async () => {
    if (chunksRef.current.length === 0) return

    try {
      const recordingBlob = new Blob(chunksRef.current, { type: 'video/webm' })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `screen-recording-${sessionId}-${timestamp}.webm`

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('recordings')
        .upload(`sessions/${sessionId}/${fileName}`, recordingBlob, {
          contentType: 'video/webm',
          upsert: false
        })

      if (error) {
        console.error('Failed to upload recording:', error)
        return
      }

      // Log recording metadata in database
      const { error: dbError } = await supabase
        .from('recordings')
        .insert({
          session_id: sessionId,
          recording_type: 'screen',
          file_path: data.path,
          file_size: recordingBlob.size,
          duration_seconds: Math.floor(recordingSize / (recordingBlob.size / 60)) // Rough estimate
        })

      if (dbError) {
        console.error('Failed to log recording metadata:', dbError)
      }

    } catch (error) {
      console.error('Error saving recording:', error)
    }
  }

  if (!isActive) {
    return null
  }

  return (
    <div className="absolute top-2 left-2 z-10">
      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${
        isRecording 
          ? 'bg-red-100 text-red-800 border border-red-200' 
          : 'bg-gray-100 text-gray-800 border border-gray-200'
      }`}>
        <div className={`w-2 h-2 rounded-full ${
          isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
        }`}></div>
        <span>{isRecording ? 'Recording Screen' : 'Screen Recording Off'}</span>
        {isRecording && recordingSize > 0 && (
          <span className="text-xs">({(recordingSize / 1024 / 1024).toFixed(1)}MB)</span>
        )}
      </div>
    </div>
  )
}