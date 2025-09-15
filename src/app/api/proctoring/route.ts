import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    let body;
    
    // Handle empty or invalid JSON
    try {
      body = await request.json()
    } catch (jsonError) {
      console.error('Invalid JSON in proctoring request:', jsonError)
      return NextResponse.json({ error: 'Invalid JSON in request' }, { status: 400 })
    }
    
    const { sessionId, eventType, confidence, metadata } = body

    if (!sessionId || !eventType) {
      console.error('Missing required fields:', { sessionId: !!sessionId, eventType: !!eventType })
      return NextResponse.json({ error: 'Session ID and event type are required' }, { status: 400 })
    }

    // Log the event for debugging (remove in production)
    console.log(`Proctoring event: ${eventType} for session ${sessionId}`, metadata || {})

    const validEventTypes = [
      // Face detection events
      'face_detected', 'face_lost',
      // Tab and window focus events  
      'tab_switch', 'tab_switch_away', 'tab_switch_back', 'tab_return',
      'window_blur', 'window_focus',
      // Screen and fullscreen events
      'fullscreen_exit', 'screen_share_stopped',
      // Security and proctoring events
      'suspicious_key_combo', 'mouse_leave', 'mouse_enter',
      // Audio events
      'audio_transcript'
    ]
    if (!validEventTypes.includes(eventType)) {
      console.error(`Invalid event type received: "${eventType}". Valid types:`, validEventTypes)
      return NextResponse.json({ 
        error: `Invalid event type: ${eventType}`, 
        validTypes: validEventTypes 
      }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Log proctoring event
    const { data, error } = await supabase
      .from('proctoring_events')
      .insert({
        session_id: sessionId,
        event_type: eventType,
        confidence: confidence || null,
        metadata: metadata || null
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to log proctoring event' }, { status: 500 })
    }

    // Update session proctoring flags count
    const { data: events } = await supabase
      .from('proctoring_events')
      .select('event_type')
      .eq('session_id', sessionId)
      .in('event_type', ['face_lost', 'tab_switch', 'window_blur', 'fullscreen_exit'])

    const flagCount = events?.length || 0

    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        proctoring_flags: flagCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Session update error:', updateError)
    }

    return NextResponse.json({
      success: true,
      eventId: data.id,
      totalFlags: flagCount
    })

  } catch (error) {
    console.error('Proctoring API error:', error)
    return NextResponse.json({ error: 'Proctoring event processing failed' }, { status: 500 })
  }
}