'use client'

import { useState, useEffect } from 'react'

interface KeyStatus {
  key: string
  isBlacklisted: boolean
  requestCount: number
  blacklistedUntil?: number
}

interface RotatorStatus {
  totalKeys: number
  activeKeys: number
  blacklistedKeys: number
  currentKey: string
  keyStatuses: KeyStatus[]
}

export default function GeminiRotatorDashboard() {
  const [status, setStatus] = useState<RotatorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<string>('')

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/gemini-status')
      const data = await response.json()
      
      if (data.success) {
        setStatus(data.status)
        setLastUpdate(new Date().toLocaleTimeString())
      }
    } catch (error) {
      console.error('Failed to fetch rotator status:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetAllKeys = async () => {
    try {
      const response = await fetch('/api/gemini-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      })
      
      const data = await response.json()
      if (data.success) {
        fetchStatus() // Refresh status
        alert('All API keys have been reset!')
      }
    } catch (error) {
      console.error('Failed to reset keys:', error)
      alert('Failed to reset keys')
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000) // Update every 30 seconds
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Gemini API Rotator Status</h3>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Gemini API Rotator Status</h3>
        <p className="text-red-600">Failed to load rotator status</p>
        <button 
          onClick={fetchStatus}
          className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-sm"
        >
          Retry
        </button>
      </div>
    )
  }

  const getStatusColor = (isBlacklisted: boolean) => {
    return isBlacklisted ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
  }

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMinutes = Math.round((timestamp - now.getTime()) / (1000 * 60))
    
    if (diffMinutes > 0) {
      return `${diffMinutes} min`
    } else {
      return 'Expired'
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Gemini API Rotator Status</h3>
        <div className="flex space-x-2">
          <button 
            onClick={fetchStatus}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          >
            Refresh
          </button>
          <button 
            onClick={resetAllKeys}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm"
            title="Reset all blacklisted keys (for testing)"
          >
            Reset All
          </button>
        </div>
      </div>
      
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-blue-50 rounded">
          <div className="text-2xl font-bold text-blue-600">{status.activeKeys}</div>
          <div className="text-sm text-gray-600">Active Keys</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded">
          <div className="text-2xl font-bold text-red-600">{status.blacklistedKeys}</div>
          <div className="text-sm text-gray-600">Blacklisted</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className="text-2xl font-bold text-gray-600">{status.totalKeys}</div>
          <div className="text-sm text-gray-600">Total Keys</div>
        </div>
      </div>

      {/* Current Key */}
      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
        <strong>Current Active Key:</strong> {status.currentKey}
      </div>

      {/* Key Details */}
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900">Key Details:</h4>
        {status.keyStatuses.map((keyStatus, index) => (
          <div key={index} className="flex items-center justify-between p-2 border rounded">
            <div className="flex items-center space-x-3">
              <span className="font-mono text-sm">{keyStatus.key}</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(keyStatus.isBlacklisted)}`}>
                {keyStatus.isBlacklisted ? 'Blacklisted' : 'Active'}
              </span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>{keyStatus.requestCount} requests</span>
              {keyStatus.isBlacklisted && keyStatus.blacklistedUntil && (
                <span className="text-red-600">
                  Expires: {formatTime(keyStatus.blacklistedUntil)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Last updated: {lastUpdate}
      </div>
    </div>
  )
}