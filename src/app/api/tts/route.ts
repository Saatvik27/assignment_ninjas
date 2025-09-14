import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('TTS API called')
    let body;
    
    // Handle empty or invalid JSON
    try {
      body = await request.json()
      console.log('TTS received body:', body)
    } catch (jsonError) {
      console.error('Invalid JSON in TTS request:', jsonError)
      return NextResponse.json({ error: 'Invalid JSON in request' }, { status: 400 })
    }
    
    const { text, speechRate = 1.0 } = body
    
    if (!text || typeof text !== 'string') {
      console.error('Invalid text in TTS request:', text)
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    if (text.length > 1000) {
      console.error('Text too long for TTS:', text.length)
      return NextResponse.json({ error: 'Text too long (max 1000 characters)' }, { status: 400 })
    }

    // Check if Murf API key is configured
    if (!process.env.MURF_API_KEY) {
      console.error('Murf API key not configured')
      return NextResponse.json({ error: 'TTS service unavailable' }, { status: 503 })
    }

    console.log('Calling Murf API with text length:', text.length, 'and speech rate:', speechRate)
    // Generate speech using Murf API
    const response = await fetch('https://api.murf.ai/v1/speech/generate', {
      method: 'POST',
      headers: {
        'api-key': process.env.MURF_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        voiceId: 'en-US-natalie',
        rate: speechRate  // Add speech rate control
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Murf API error:', error)
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
    }

    const data = await response.json()
    
    if (data.audioFile) {
      // Return the audio file URL from Murf
      return NextResponse.json({ 
        audioUrl: data.audioFile,
        audioLengthInSeconds: data.audioLengthInSeconds 
      })
    } else {
      console.error('No audio file in Murf response:', data)
      return NextResponse.json({ error: 'No audio file generated' }, { status: 500 })
    }
  } catch (error) {
    console.error('TTS API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}