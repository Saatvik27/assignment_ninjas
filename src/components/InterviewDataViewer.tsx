'use client'

import { useState } from 'react'

interface InterviewData {
  sessionInfo: {
    id: string
    status: string
    candidateName: string
    interviewScore: number
    excelScore: number
    totalScore: number
  }
  questionAnswerPairs: Array<{
    questionNumber: number
    question: string
    answer?: string
    score?: number
    scoreReasoning?: string
  }>
  summary: {
    totalQuestions: number
    totalAnswers: number
    totalScores: number
    averageScore: number
  }
}

export default function InterviewDataViewer() {
  const [sessionId, setSessionId] = useState('')
  const [data, setData] = useState<InterviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchData = async () => {
    if (!sessionId.trim()) {
      setError('Please enter a session ID')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/interview-data?sessionId=${encodeURIComponent(sessionId)}`)
      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error || 'Failed to fetch data')
      }
    } catch (err) {
      setError('Network error occurred')
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Interview Data Viewer</h3>
      
      <div className="flex space-x-2 mb-4">
        <input
          type="text"
          placeholder="Enter Session ID"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
        />
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded text-sm disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Fetch Data'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Session Info */}
          <div className="p-3 bg-gray-50 rounded">
            <h4 className="font-medium mb-2">Session Information</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Status: <strong>{data.sessionInfo.status}</strong></div>
              <div>Interview Score: <strong>{data.sessionInfo.interviewScore}</strong></div>
              <div>Excel Score: <strong>{data.sessionInfo.excelScore}</strong></div>
              <div>Total Score: <strong>{data.sessionInfo.totalScore}</strong></div>
            </div>
          </div>

          {/* Summary */}
          <div className="p-3 bg-blue-50 rounded">
            <h4 className="font-medium mb-2">Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Questions: <strong>{data.summary.totalQuestions}</strong></div>
              <div>Answers: <strong>{data.summary.totalAnswers}</strong></div>
              <div>Scores: <strong>{data.summary.totalScores}</strong></div>
              <div>Average Score: <strong>{data.summary.averageScore.toFixed(1)}</strong></div>
            </div>
          </div>

          {/* Question-Answer Pairs */}
          <div>
            <h4 className="font-medium mb-2">Question-Answer Pairs</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data.questionAnswerPairs.map((pair, index) => (
                <div key={index} className="p-3 border rounded text-sm">
                  <div className="font-medium text-blue-900 mb-1">
                    Q{pair.questionNumber}: {pair.question}
                  </div>
                  {pair.answer && (
                    <div className="text-gray-700 mb-1">
                      A: {pair.answer}
                    </div>
                  )}
                  {pair.score !== undefined && (
                    <div className="text-green-700">
                      Score: {pair.score}/10
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}