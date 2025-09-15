import { GoogleGenAI } from "@google/genai"
import { makeGeminiRequest, geminiRotator } from "./gemini-rotator"

// Free alternative to OpenAI GPT using Google Gemini with API key rotation
export async function generateInterviewQuestion(
  questionNumber: number = 1, 
  difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate',
  previousQuestions: string[] = []
): Promise<string> {
  try {
    // Create a comprehensive list of all previously asked or skipped questions
    const allPreviousQuestions = previousQuestions.filter(q => q && q.trim().length > 0)
    
    // Extract key topics from previous questions to avoid repetition
    const usedTopics = new Set<string>()
    allPreviousQuestions.forEach(question => {
      const lowerQ = question.toLowerCase()
      // Extract key Excel terms to avoid topic repetition
      const topics = [
        'vlookup', 'hlookup', 'index', 'match', 'pivot', 'table', 'chart', 'formula', 
        'function', 'reference', 'cell', 'conditional', 'formatting', 'validation',
        'macro', 'vba', 'array', 'circular', 'performance', 'filter', 'sort'
      ]
      topics.forEach(topic => {
        if (lowerQ.includes(topic)) usedTopics.add(topic)
      })
    })

    const previousQuestionsText = allPreviousQuestions.length > 0 
      ? `\n\nPREVIOUSLY ASKED OR SKIPPED QUESTIONS (NEVER repeat these topics or ask similar questions):\n${allPreviousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nUSED TOPICS TO AVOID: ${Array.from(usedTopics).join(', ')}`
      : ''
    
    const prompt = `You are an Excel expert creating theoretical interview questions for a ${difficulty} level candidate.

This is question #${questionNumber} in the interview sequence.

Generate ONE theoretical Excel interview question that tests conceptual knowledge and understanding.

CRITICAL REQUIREMENTS:
- MUST be completely different from all previously asked questions
- Focus on THEORETICAL concepts, not practical scenarios  
- Ask about Excel functions, features, or concepts directly
- Questions should be answerable with explanations, not step-by-step instructions
- For ${difficulty} level: ${getDifficultyGuidelines(difficulty)}
- NEVER repeat topics already covered in previous questions

Examples of good theoretical questions:
* "What is the difference between VLOOKUP and INDEX-MATCH functions?"
* "Explain how Excel handles circular references"
* "What are the advantages of using PivotTables over regular data tables?"
* "How does Excel's order of operations work in formulas?"

STRICT AVOIDANCE RULES:
- Do NOT ask about topics already covered
- Do NOT use similar wording to previous questions
- Do NOT repeat any Excel function or feature already discussed
- Choose completely different Excel areas/topics${previousQuestionsText}

Return only the theoretical question text, no extra formatting.`

    const response = await makeGeminiRequest(async (client) => {
      return await client.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
      })
    })
    
    const text = response.text || ''
    const cleanQuestion = text.trim()
    
    // Additional validation to prevent similar questions
    if (allPreviousQuestions.length > 0) {
      const isToSimilar = allPreviousQuestions.some(prev => {
        const similarity = calculateSimilarity(prev.toLowerCase(), cleanQuestion.toLowerCase())
        return similarity > 0.4 // Stricter similarity check
      })
      
      if (isToSimilar) {
        console.log('Generated question too similar, using fallback')
        return getFallbackQuestion(difficulty, questionNumber)
      }
    }
    
    return cleanQuestion || getFallbackQuestion(difficulty, questionNumber)
  } catch (error) {
    console.error('Gemini question generation error:', error)
    return getFallbackQuestion(difficulty, questionNumber)
  }
}

// Helper function to calculate similarity between two strings (improved)
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(' ').filter(word => word.length > 3)
  const words2 = str2.split(' ').filter(word => word.length > 3)
  
  if (words1.length === 0 || words2.length === 0) return 0
  
  const commonWords = words1.filter(word => words2.includes(word))
  return commonWords.length / Math.max(words1.length, words2.length)
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

    const response = await makeGeminiRequest(async (client) => {
      return await client.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
      })
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

function getFallbackQuestion(difficulty: string, questionNumber: number = 1): string {
  const fallbacks = {
    beginner: [
      'What is the difference between a formula and a function in Excel?',
      'How do you create and use cell references in Excel?',
      'What are the different data types that Excel can handle?',
      'Explain the concept of relative vs absolute cell references.'
    ],
    intermediate: [
      'Explain the key differences between VLOOKUP and INDEX-MATCH functions.',
      'What is the purpose and functionality of PivotTables in Excel?',
      'How do conditional formatting rules work in Excel?',
      'What are the advantages of using named ranges in Excel?'
    ],
    advanced: [
      'What are the advantages and limitations of using array formulas in Excel?',
      'How do you optimize Excel performance for large datasets?',
      'Explain the concept of volatile functions and their impact on workbook performance.',
      'What are the different ways to handle circular references in Excel?'
    ]
  }
  
  const questionSet = fallbacks[difficulty as keyof typeof fallbacks] || fallbacks.intermediate
  const index = (questionNumber - 1) % questionSet.length
  return questionSet[index]
}

// Keep original OpenAI functions as backup
export async function transcribeAudio(audioFile: File): Promise<string> {
  // This still uses OpenAI Whisper - would need a different free alternative for STT
  // Could use Web Speech API client-side instead
  throw new Error('Use Web Speech API for free speech-to-text instead of OpenAI Whisper')
}