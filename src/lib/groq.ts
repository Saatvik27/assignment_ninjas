import Groq from "groq-sdk"

// Initialize Groq client for super-fast inference
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Fast alternative to Gemini using Groq's lightning-fast inference
export async function generateInterviewQuestion(
  questionNumber: number = 1, 
  difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate',
  previousQuestions: string[] = []
): Promise<string> {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an Excel expert creating interview questions for a ${difficulty} level candidate. Generate ONE specific, practical Excel interview question that tests real-world skills.`
        },
        {
          role: "user",
          content: `This is question #${questionNumber} in the interview sequence.

${previousQuestions.length > 0 ? `Previous questions asked:
${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

` : ''}Generate ONE specific, practical Excel interview question that tests real-world skills.

Requirements:
- Focus on Excel functions, formulas, or data analysis
- Should be answerable in 2-3 minutes
- For ${difficulty} level: ${getDifficultyGuidelines(difficulty)}
- Make it progressively challenging based on question number
- AVOID asking similar questions to those already asked above
- Return only the question text, no extra formatting.`
        }
      ],
      model: "llama-3.1-8b-instant", // Fast Groq model that's currently available
      temperature: 0.7,
      max_tokens: 200,
      top_p: 1,
      stream: false
    })

    const question = chatCompletion.choices[0]?.message?.content?.trim()
    return question || getFallbackQuestion(difficulty)
  } catch (error) {
    console.error('Groq question generation error:', error)
    return getFallbackQuestion(difficulty)
  }
}

export async function scoreAndGenerateFollowup(
  transcript: string,
  questionContext: string,
  previousConversation: string = ''
): Promise<{ score: number; reasoning: string; followupQuestion: string }> {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an AI interviewer conducting an Excel skills assessment. Evaluate answers and generate follow-up questions."
        },
        {
          role: "user",
          content: `Previous conversation context:
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
        }
      ],
      model: "llama-3.1-8b-instant", // Fast Groq model for consistent scoring
      temperature: 0.3, // Lower temperature for consistent scoring
      max_tokens: 500,
      top_p: 1,
      stream: false
    })

    const responseText = chatCompletion.choices[0]?.message?.content?.trim()
    
    if (responseText) {
      try {
        const parsed = JSON.parse(responseText)
        return {
          score: Math.max(1, Math.min(10, parsed.score || 5)),
          reasoning: parsed.reasoning || 'Answer evaluated',
          followupQuestion: parsed.followupQuestion || 'Can you explain more about your Excel experience?'
        }
      } catch (parseError) {
        console.error('Failed to parse Groq response:', parseError)
      }
    }

    // Fallback response
    return {
      score: 5,
      reasoning: 'Unable to evaluate response properly',
      followupQuestion: 'Can you provide more details about your Excel experience?'
    }
  } catch (error) {
    console.error('Groq scoring error:', error)
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
    beginner: 'How would you sum a range of cells in Excel?',
    intermediate: 'What is the difference between VLOOKUP and INDEX-MATCH functions?',
    advanced: 'How would you create a dynamic dashboard in Excel with multiple data sources?'
  }
  return fallbacks[difficulty as keyof typeof fallbacks] || fallbacks.intermediate
}

// Fast speech-to-text alternative (keep for reference, but Web Speech API is already implemented)
export async function transcribeAudioWithGroq(audioFile: File): Promise<string> {
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      prompt: "This is an Excel interview conversation about spreadsheet functions and formulas.",
      response_format: "json",
      language: "en",
      temperature: 0.0
    })

    return transcription.text || ''
  } catch (error) {
    console.error('Groq transcription error:', error)
    throw new Error('Use Web Speech API for free speech-to-text instead of Groq Whisper')
  }
}