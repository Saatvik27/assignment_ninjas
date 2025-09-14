import { GoogleGenAI } from "@google/genai"

interface ApiKeyStatus {
  key: string
  isBlacklisted: boolean
  blacklistedUntil?: number
  lastUsed?: number
  requestCount: number
}

class GeminiRotator {
  private apiKeys: string[]
  private currentKeyIndex: number = 0
  private keyStatuses: Map<string, ApiKeyStatus> = new Map()
  private clients: Map<string, GoogleGenAI> = new Map()
  private blacklistDuration = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

  constructor() {
    // Add your Gemini API keys here - you should have multiple keys
    this.apiKeys = [
      process.env.GEMINI_API_KEY!,
      process.env.GEMINI_API_KEY_2!,
      process.env.GEMINI_API_KEY_3!,
      process.env.GEMINI_API_KEY_4!,
      process.env.GEMINI_API_KEY_5!
    ].filter(key => key && key.trim() !== '') // Remove empty keys

    if (this.apiKeys.length === 0) {
      throw new Error('No Gemini API keys found in environment variables')
    }

    // Initialize key statuses and clients
    this.apiKeys.forEach(key => {
      this.keyStatuses.set(key, {
        key,
        isBlacklisted: false,
        requestCount: 0
      })
      
      // Create individual GoogleGenAI client for each key
      this.clients.set(key, new GoogleGenAI({
        apiKey: key
      }))
    })

    console.log(`Gemini Rotator initialized with ${this.apiKeys.length} API keys`)
  }

  /**
   * Get the current active API client
   */
  getCurrentClient(): GoogleGenAI {
    const activeKey = this.getActiveKey()
    const client = this.clients.get(activeKey)
    
    if (!client) {
      throw new Error('No active Gemini API client available')
    }

    // Update usage stats
    const status = this.keyStatuses.get(activeKey)!
    status.lastUsed = Date.now()
    status.requestCount++

    return client
  }

  /**
   * Get the currently active API key
   */
  private getActiveKey(): string {
    // Clean up expired blacklists
    this.cleanupExpiredBlacklists()

    // Find the first non-blacklisted key starting from current index
    for (let i = 0; i < this.apiKeys.length; i++) {
      const keyIndex = (this.currentKeyIndex + i) % this.apiKeys.length
      const key = this.apiKeys[keyIndex]
      const status = this.keyStatuses.get(key)!

      if (!status.isBlacklisted) {
        this.currentKeyIndex = keyIndex
        return key
      }
    }

    // If all keys are blacklisted, find the one that expires soonest
    let earliestExpiry = Infinity
    let bestKey = this.apiKeys[0]
    let bestIndex = 0

    this.apiKeys.forEach((key, index) => {
      const status = this.keyStatuses.get(key)!
      if (status.blacklistedUntil && status.blacklistedUntil < earliestExpiry) {
        earliestExpiry = status.blacklistedUntil
        bestKey = key
        bestIndex = index
      }
    })

    console.warn(`All Gemini API keys are blacklisted. Using ${bestKey.substring(0, 8)}... (expires in ${Math.round((earliestExpiry - Date.now()) / 1000 / 60)} minutes)`)
    this.currentKeyIndex = bestIndex
    return bestKey
  }

  /**
   * Handle API errors and blacklist keys if necessary
   */
  async handleApiError(error: any, retryAttempt: number = 0): Promise<void> {
    const currentKey = this.apiKeys[this.currentKeyIndex]
    const isQuotaError = this.isQuotaLimitError(error)
    const isRateLimitError = this.isRateLimitError(error)

    console.error(`Gemini API Error (Key: ${currentKey.substring(0, 8)}...):`, error.message || error)

    if (isQuotaError || isRateLimitError) {
      this.blacklistCurrentKey(isQuotaError ? 'quota' : 'rate_limit')
      
      // Try next key if available and not already retried
      if (retryAttempt < this.apiKeys.length - 1 && this.hasAvailableKeys()) {
        console.log(`Switching to next available API key...`)
        return // Caller should retry with new key
      }
    }

    // If it's not a quota/rate limit error, or we've exhausted retries, throw the error
    throw error
  }

  /**
   * Blacklist the current key for 24 hours
   */
  private blacklistCurrentKey(reason: 'quota' | 'rate_limit' | 'error' = 'quota'): void {
    const currentKey = this.apiKeys[this.currentKeyIndex]
    const status = this.keyStatuses.get(currentKey)!
    
    status.isBlacklisted = true
    status.blacklistedUntil = Date.now() + this.blacklistDuration

    console.warn(`🚫 Gemini API key ${currentKey.substring(0, 8)}... blacklisted for 24 hours (Reason: ${reason})`)
    console.log(`📊 Remaining active keys: ${this.getAvailableKeysCount()}/${this.apiKeys.length}`)

    // Move to next available key
    this.moveToNextKey()
  }

  /**
   * Move to the next available key
   */
  private moveToNextKey(): void {
    const startIndex = this.currentKeyIndex
    
    do {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length
      const key = this.apiKeys[this.currentKeyIndex]
      const status = this.keyStatuses.get(key)!
      
      if (!status.isBlacklisted) {
        console.log(`✅ Switched to API key ${key.substring(0, 8)}...`)
        return
      }
    } while (this.currentKeyIndex !== startIndex)

    console.warn('⚠️ All API keys are blacklisted!')
  }

  /**
   * Check if error is a quota limit error
   */
  private isQuotaLimitError(error: any): boolean {
    if (!error) return false
    
    const message = error.message || error.toString() || ''
    const status = error.status || error.code || 0
    
    return status === 429 || 
           message.includes('quota') ||
           message.includes('RESOURCE_EXHAUSTED') ||
           message.includes('exceeded your current quota')
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false
    
    const message = error.message || error.toString() || ''
    const status = error.status || error.code || 0
    
    return status === 429 ||
           status === 503 ||
           message.includes('rate limit') ||
           message.includes('Too Many Requests') ||
           message.includes('overloaded')
  }

  /**
   * Clean up expired blacklists
   */
  private cleanupExpiredBlacklists(): void {
    const now = Date.now()
    let cleanedCount = 0

    this.keyStatuses.forEach((status) => {
      if (status.isBlacklisted && status.blacklistedUntil && status.blacklistedUntil <= now) {
        status.isBlacklisted = false
        status.blacklistedUntil = undefined
        cleanedCount++
        console.log(`✅ API key ${status.key.substring(0, 8)}... blacklist expired - now available`)
      }
    })

    if (cleanedCount > 0) {
      console.log(`🔄 Cleaned up ${cleanedCount} expired blacklisted keys`)
    }
  }

  /**
   * Check if there are any available (non-blacklisted) keys
   */
  private hasAvailableKeys(): boolean {
    return this.getAvailableKeysCount() > 0
  }

  /**
   * Get count of available keys
   */
  private getAvailableKeysCount(): number {
    this.cleanupExpiredBlacklists()
    return Array.from(this.keyStatuses.values()).filter(status => !status.isBlacklisted).length
  }

  /**
   * Get status information for monitoring
   */
  getStatus(): {
    totalKeys: number
    activeKeys: number
    blacklistedKeys: number
    currentKey: string
    keyStatuses: Array<{
      key: string
      isBlacklisted: boolean
      requestCount: number
      blacklistedUntil?: number
    }>
  } {
    this.cleanupExpiredBlacklists()
    
    return {
      totalKeys: this.apiKeys.length,
      activeKeys: this.getAvailableKeysCount(),
      blacklistedKeys: this.apiKeys.length - this.getAvailableKeysCount(),
      currentKey: this.apiKeys[this.currentKeyIndex].substring(0, 8) + '...',
      keyStatuses: Array.from(this.keyStatuses.values()).map(status => ({
        key: status.key.substring(0, 8) + '...',
        isBlacklisted: status.isBlacklisted,
        requestCount: status.requestCount,
        blacklistedUntil: status.blacklistedUntil
      }))
    }
  }

  /**
   * Force unblacklist all keys (for testing or emergency)
   */
  resetAllKeys(): void {
    this.keyStatuses.forEach((status) => {
      status.isBlacklisted = false
      status.blacklistedUntil = undefined
      status.requestCount = 0
    })
    console.log('🔄 All API keys reset and unblacklisted')
  }
}

// Create singleton instance
export const geminiRotator = new GeminiRotator()

// Export convenience function for making API calls with automatic rotation
export async function makeGeminiRequest<T>(
  requestFn: (client: GoogleGenAI) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const client = geminiRotator.getCurrentClient()
      const result = await requestFn(client)
      return result
    } catch (error) {
      lastError = error
      
      try {
        await geminiRotator.handleApiError(error, attempt)
        // If handleApiError doesn't throw, it means we should retry
        console.log(`Retrying request with new API key... (Attempt ${attempt + 1}/${maxRetries})`)
      } catch (e) {
        // If handleApiError throws, it means we can't recover
        throw e
      }
    }
  }
  
  throw lastError
}