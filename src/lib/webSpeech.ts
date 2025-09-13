// Free alternative to OpenAI Whisper using Web Speech API

// Type definitions for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export class WebSpeechAPI {
  private recognition: any = null
  private isListening = false

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition()
        this.setupRecognition()
      }
    }
  }

  private setupRecognition() {
    if (!this.recognition) return

    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.lang = 'en-US'
    this.recognition.maxAlternatives = 1
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech recognition not supported'))
        return
      }

      let finalTranscript = ''
      let timeoutId: NodeJS.Timeout

      this.recognition.onresult = (event: any) => {
        let interimTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }

        // Clear timeout on any result
        if (timeoutId) clearTimeout(timeoutId)
        
        // Set new timeout for final result
        timeoutId = setTimeout(() => {
          if (finalTranscript.trim()) {
            this.stopListening()
            resolve(finalTranscript.trim())
          }
        }, 2000) // Wait 2 seconds after last speech
      }

      this.recognition.onerror = (event: any) => {
        this.stopListening()
        reject(new Error(`Speech recognition error: ${event.error}`))
      }

      this.recognition.onend = () => {
        this.isListening = false
        if (!finalTranscript.trim()) {
          resolve('') // Return empty string if no speech detected
        }
      }

      // Start listening
      try {
        this.recognition.start()
        this.isListening = true
        
        // Timeout after 30 seconds
        setTimeout(() => {
          if (this.isListening) {
            this.stopListening()
            resolve(finalTranscript.trim() || 'No speech detected')
          }
        }, 30000)
      } catch (error) {
        reject(error)
      }
    })
  }

  startListening(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech recognition not supported'))
        return
      }

      let transcript = ''
      
      this.recognition.onresult = (event: any) => {
        transcript = ''
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
      }

      this.recognition.onerror = (event: any) => {
        reject(new Error(`Speech recognition error: ${event.error}`))
      }

      this.recognition.onend = () => {
        this.isListening = false
        resolve(transcript)
      }

      try {
        this.recognition.start()
        this.isListening = true
      } catch (error) {
        reject(error)
      }
    })
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop()
      this.isListening = false
    }
  }

  isSupported(): boolean {
    return this.recognition !== null
  }

  getIsListening(): boolean {
    return this.isListening
  }
}