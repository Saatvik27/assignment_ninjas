import { GoogleGenAI } from "@google/genai"

// Initialize Gemini client  
const ai = new GoogleGenAI({})

// Free alternative to OpenAI GPT using Google Gemini
export async function generateInterviewQuestion(questionNumber: number = 1, difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'): Promise<string> {
  try {
    const prompt = `You are an Excel expert creating theoretical interview questions for a ${difficulty} level candidate.

This is question #${questionNumber} in the interview sequence.

Generate ONE theoretical Excel interview question that tests conceptual knowledge and understanding.

Requirements:
- Focus on THEORETICAL concepts, not practical scenarios
- Ask about Excel functions, features, or concepts directly
- Questions should be answerable with explanations, not step-by-step instructions
- For ${difficulty} level: ${getDifficultyGuidelines(difficulty)}
- Examples of good theoretical questions:
  * "What is the difference between VLOOKUP and INDEX-MATCH functions?"
  * "Explain how Excel handles circular references"
  * "What are the advantages of using PivotTables over regular data tables?"
  * "How does Excel's order of operations work in formulas?"

Avoid:
- Detailed scenarios or case studies
- Multi-step practical problems
- Worksheet setups or specific business contexts
- Questions requiring formula writing

Return only the theoretical question text, no extra formatting.`

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro", // Updated to faster Gemini 2.5 Pro model
      contents: prompt,
    })
    const text = response.text || ''
    
    return text.trim() || 'What is the difference between VLOOKUP and INDEX-MATCH functions in Excel?'
  } catch (error) {
    console.error('Gemini question generation error:', error)
    return getFallbackQuestion(difficulty)
  }
}

export async function scoreAndGenerateFollowup(
  transcript: string,
  questionContext: string,
  previousConversation: string = ''
): Promise<{ score: number; reasoning: string; followupQuestion: string }> {
  try {
    const prompt = `You are an AI interviewer conducting an Excel skills assessment.

Previous conversation context:
${previousConversation}

Current question context: ${questionContext}
Candidate's answer: "${transcript}"

Evaluate the answer on a scale of 1-10 based on:
1. Technical accuracy (40%)
2. Completeness of explanation (30%)
3. Practical understanding (20%)
4. Communication clarity (10%)

Then generate a relevant follow-up question to dive deeper or move to the next topic.

Respond in JSON format:
{
  "score": <number 1-10>,
  "reasoning": "<brief explanation of the score>",
  "followupQuestion": "<next question to ask>"
}`

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro", // Updated to faster Gemini 2.5 Pro model
      contents: prompt,
    })
    const text = response.text || ''
    
    try {
      // Clean up the response text by removing markdown code blocks
      let cleanText = text.trim()
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }
      
      const parsed = JSON.parse(cleanText)
      return {
        score: Math.max(1, Math.min(10, parsed.score || 5)),
        reasoning: parsed.reasoning || 'Answer evaluated',
        followupQuestion: parsed.followupQuestion || 'Can you explain more about your Excel experience?'
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError)
      return {
        score: 5,
        reasoning: 'Unable to evaluate response properly',
        followupQuestion: 'Can you provide more details about your Excel experience?'
      }
    }
  } catch (error) {
    console.error('Gemini scoring error:', error)
    return {
      score: 5,
      reasoning: 'Technical issue with evaluation',
      followupQuestion: 'Let me ask you another question about Excel.'
    }
  }
}

function getDifficultyGuidelines(difficulty: string): string {
  switch (difficulty) {
    case 'beginner':
      return 'Basic formulas (SUM, AVERAGE, COUNT), simple formatting, basic charts'
    case 'intermediate':
      return 'VLOOKUP, HLOOKUP, IF statements, PivotTables, data validation'
    case 'advanced':
      return 'INDEX-MATCH, array formulas, VBA basics, complex PivotTables, data modeling'
    default:
      return 'Mixed difficulty covering various Excel functions and features'
  }
}

function getFallbackQuestion(difficulty: string): string {
  const fallbacks = {
    beginner: 'What is the difference between a formula and a function in Excel?',
    intermediate: 'Explain the key differences between VLOOKUP and INDEX-MATCH functions.',
    advanced: 'What are the advantages and limitations of using array formulas in Excel?'
  }
  return fallbacks[difficulty as keyof typeof fallbacks] || fallbacks.intermediate
}

// Keep original OpenAI functions as backup
export async function transcribeAudio(audioFile: File): Promise<string> {
  // This still uses OpenAI Whisper - would need a different free alternative for STT
  // Could use Web Speech API client-side instead
  throw new Error('Use Web Speech API for free speech-to-text instead of OpenAI Whisper')
}