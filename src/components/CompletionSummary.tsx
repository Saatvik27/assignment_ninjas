'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface CompletionSummaryProps {
  sessionId: string
}

interface SessionSummary {
  interview_score: number
  excel_score: number
  total_score: number
  status: string
  candidate_name: string
  ended_at: string
}

export default function CompletionSummary({ sessionId }: CompletionSummaryProps) {
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchSessionSummary = async () => {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('interview_score, excel_score, total_score, status, candidate_name, ended_at')
          .eq('id', sessionId)
          .single()

        if (error) {
          console.error('Failed to fetch session summary:', error)
        } else {
          setSummary(data)
        }
      } catch (err) {
        console.error('Session summary fetch error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSessionSummary()
  }, [sessionId])

  const generateReport = async () => {
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })
      if (response.ok) {
        console.log('Report generated successfully')
        alert('Report has been generated and sent to the recruiter.')
      }
    } catch (error) {
      console.error('Report generation failed:', error)
      alert('Failed to generate report. Please try again.')
    }
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading results...</p>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Error Loading Results</h2>
        <p className="text-gray-600">Unable to load session summary.</p>
      </div>
    )
  }

  return (
    <div className="text-center py-8">
      <h2 className="text-3xl font-bold text-green-600 mb-6">🎉 Interview Completed!</h2>
      
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
        <h3 className="text-xl font-semibold text-gray-800 mb-6">Your Performance Summary</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-blue-50 p-6 rounded-lg">
            <h4 className="text-lg font-medium text-blue-900 mb-2">Voice Interview</h4>
            <p className="text-3xl font-bold text-blue-600">{summary.interview_score}</p>
            <p className="text-sm text-blue-700">out of 40 points (40%)</p>
            <p className="text-xs text-blue-600 mt-1">8 questions × 5 points each</p>
          </div>
          
          <div className="bg-purple-50 p-6 rounded-lg">
            <h4 className="text-lg font-medium text-purple-900 mb-2">Excel Tasks</h4>
            <p className="text-3xl font-bold text-purple-600">{summary.excel_score}</p>
            <p className="text-sm text-purple-700">out of 60 points (60%)</p>
            <p className="text-xs text-purple-600 mt-1">2 tasks × 30 points each</p>
          </div>
          
          <div className="bg-green-50 p-6 rounded-lg">
            <h4 className="text-lg font-medium text-green-900 mb-2">Total Score</h4>
            <p className="text-3xl font-bold text-green-600">{summary.total_score}</p>
            <p className="text-sm text-green-700">out of 100 points</p>
            <p className="text-xs text-green-600 mt-1">
              {Math.round((summary.total_score / 100) * 100)}% overall
            </p>
          </div>
        </div>

        <div className="border-t pt-6">
          <p className="text-gray-600 mb-4">
            Thank you, <span className="font-medium">{summary.candidate_name}</span>, for completing the Excel skills assessment.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Session completed at: {new Date(summary.ended_at).toLocaleString()}
          </p>
          <p className="text-gray-600 mb-6">
            Your responses are being processed. The recruiter will review your performance and get back to you soon.
          </p>
          
          <button
            onClick={generateReport}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors"
          >
            Generate Final Report
          </button>
          
          <p className="text-xs text-gray-400 mt-4">Session ID: {sessionId}</p>
        </div>
      </div>
    </div>
  )
}