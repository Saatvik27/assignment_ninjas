// ElevenLabs Text-to-Speech integration

export interface ElevenLabsVoice {
  voice_id: string
  name: string
}

// Popular ElevenLabs voice IDs (use professional voices)
export const VOICE_IDS = {
  RACHEL: '21m00Tcm4TlvDq8ikWAM', // Professional female
  DREW: '29vD33N1CtxCmqQRPOHJ',   // Professional male
  CLYDE: '2EiwWnXFnvU5JabPnv8n',  // Professional male
  SARAH: 'EXAVITQu4vr4xnSDxMaL'   // Professional female
}

export async function generateSpeech(
  text: string, 
  voiceId: string = VOICE_IDS.RACHEL
): Promise<ArrayBuffer> {
  const API_KEY = process.env.ELEVENLABS_API_KEY
  
  if (!API_KEY) {
    throw new Error('ElevenLabs API key not configured')
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`)
    }

    return await response.arrayBuffer()
  } catch (error) {
    console.error('TTS generation error:', error)
    throw new Error('Failed to generate speech')
  }
}

// Alternative: OpenAI TTS (fallback option)
export async function generateSpeechOpenAI(text: string): Promise<ArrayBuffer> {
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'nova', // Professional female voice
        response_format: 'mp3'
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI TTS error: ${response.status}`)
    }

    return await response.arrayBuffer()
  } catch (error) {
    console.error('OpenAI TTS error:', error)
    throw new Error('Failed to generate speech with OpenAI')
  }
}