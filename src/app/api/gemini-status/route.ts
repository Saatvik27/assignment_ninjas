import { NextRequest, NextResponse } from 'next/server'
import { geminiRotator } from '@/lib/gemini-rotator'

export async function GET(request: NextRequest) {
  try {
    const status = geminiRotator.getStatus()
    
    return NextResponse.json({
      success: true,
      status: status,
      timestamp: new Date().toISOString(),
      message: `${status.activeKeys}/${status.totalKeys} API keys available`
    })
  } catch (error) {
    console.error('Error getting Gemini rotator status:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get rotator status'
    }, { status: 500 })
  }
}

// Optional: Add a reset endpoint for testing (remove in production)
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    
    if (action === 'reset') {
      geminiRotator.resetAllKeys()
      return NextResponse.json({
        success: true,
        message: 'All API keys reset and unblacklisted'
      })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })
  } catch (error) {
    console.error('Error resetting Gemini rotator:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to reset rotator'
    }, { status: 500 })
  }
}