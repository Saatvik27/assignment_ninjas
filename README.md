# Excel Skills Interview System

A complete AI-powered interview system for evaluating Excel skills with voice interaction, practical tasks, and automated proctoring.

## Features

- **Voice Interview**: AI-powered conversational interview with speech-to-text and text-to-speech
- **Excel Tasks**: Interactive spreadsheet tasks with formula validation
- **Proctoring**: Face detection and screen recording for interview integrity
- **Automated Scoring**: AI-driven evaluation with detailed reports
- **Real-time Processing**: Live transcription and immediate feedback

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **AI Services**: OpenAI (Whisper, GPT-4o-mini), ElevenLabs
- **Excel**: Luckysheet
- **Media**: WebRTC, MediaRecorder

## Quick Setup

### 1. Environment Setup

```bash
# Clone and install dependencies
cd assignment_ninjas
npm install

# Copy environment template
copy .env.example .env.local
```

### 2. Configure Environment Variables

Edit `.env.local` with your API keys:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

### 3. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor in your Supabase dashboard
3. Run the SQL commands from `database/schema.sql`
4. This will create all necessary tables and storage buckets

### 4. Start Development

```bash
npm run dev
```

Visit http://localhost:3000/interview to start an interview session.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── excel-task/     # Excel task evaluation
│   │   ├── interview/      # LLM scoring and questions
│   │   ├── proctoring/     # Proctoring event logging
│   │   ├── report/         # Final report generation
│   │   ├── stt/           # Speech-to-text
│   │   └── tts/           # Text-to-speech
│   └── interview/          # Main interview page
├── components/
│   ├── AudioRecorder.tsx   # Voice recording
│   ├── ExcelTask.tsx      # Interactive Excel tasks
│   ├── FaceDetection.tsx  # Face presence monitoring
│   ├── ScreenRecording.tsx # Screen recording
│   └── VoiceInterview.tsx # Voice Q&A interface
├── lib/
│   ├── elevenlabs.ts      # TTS integration
│   ├── openai.ts          # STT and LLM integration
│   └── supabase.ts        # Database client
└── database/
    └── schema.sql          # Database schema
```

## API Endpoints

- `POST /api/stt` - Speech-to-text transcription
- `POST /api/tts` - Text-to-speech generation
- `POST /api/interview` - Question generation and answer scoring
- `POST /api/excel-task` - Excel formula evaluation
- `POST /api/proctoring` - Proctoring event logging
- `POST /api/report` - Final report generation

## Database Schema

- **sessions** - Interview sessions
- **interview_events** - Voice Q&A transcripts and scores
- **excel_tasks** - Excel task submissions and results
- **proctoring_events** - Face detection and behavior logs
- **reports** - Final interview reports
- **recordings** - Screen/audio recording metadata

## Interview Flow

1. **Setup Phase**: Candidate permissions and session creation
2. **Voice Interview**: 5 AI-generated Excel questions with real-time scoring
3. **Excel Tasks**: 2 practical spreadsheet tasks with formula validation
4. **Completion**: Automated report generation with recommendations

## Scoring System

- **Interview Score**: Weighted average of voice Q&A responses (60%)
- **Excel Score**: Practical task performance (40%)
- **Proctoring Flags**: Behavioral integrity indicators
- **Overall Recommendation**: Hire/No-hire with reasoning

## Production Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel --prod
```

### Environment Variables for Production
Add all `.env.local` variables to your deployment platform.

## Security Notes

- All API keys are server-side only
- Media streams are handled client-side
- Screen recordings stored securely in Supabase Storage
- Row Level Security enabled on all database tables

## Customization

- **Add Questions**: Modify prompts in `src/lib/openai.ts`
- **Excel Tasks**: Update `EXCEL_TASKS` in `src/components/ExcelTask.tsx`
- **Scoring Rubric**: Adjust weights in `src/app/api/report/route.ts`
- **UI Theme**: Modify Tailwind classes throughout components

## Troubleshooting

### Media Permissions
- Ensure HTTPS in production for media access
- Chrome may block autoplay - user interaction required

### API Rate Limits
- OpenAI: Monitor usage in dashboard
- ElevenLabs: Check character limits

### Supabase Storage
- Configure CORS for file uploads
- Set appropriate bucket policies

## License

MIT License - feel free to modify for your needs.

## Support

For issues or questions, check the Next.js and Supabase documentation or create an issue in this repository.
