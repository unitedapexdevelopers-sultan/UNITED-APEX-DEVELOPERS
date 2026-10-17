# Apex Counsel AI

A voice-enabled legal AI assistant for law students and lawyers, built by United Apex Developers.
It covers **UK, US and Pakistani law** and runs on Claude (`claude-opus-5-5`).

## Features

- **Jurisdictions:** UK (England & Wales, Scotland, NI), US (federal and states), Pakistan (federal and provinces). Each has its own sources, citation style (neutral citations, Bluebook, PLD/SCMR) and court hierarchy.
- **Modes:** Case analysis (IRAC, strengths and weaknesses, procedure), Legal research, Drafting (notices, plaints, petitions, letters before action), and Study & exams.
- **Voice:**
  - 🎤 Speak your question (English UK/US/Pakistan, or Urdu).
  - 🔊 Have answers read aloud, or tap *Listen* on any answer.
  - Hands-free conversation: speak, hear the answer, and it listens again.
- **PDF upload:** attach judgments, contracts or pleadings for review.
- **Web research:** optionally searches the web for current law and lists its sources.
- **Streaming:** answers appear as they're written. The model has to say when it isn't sure of a citation, and it must not invent authorities.

Voice uses the browser's built-in speech features, so it costs nothing extra. It works best in **Chrome or Edge**. Safari supports it partly; Firefox has no speech input.
The page must be opened on `localhost` or over HTTPS for microphone access.

## Run it

Requirements: Node 18+ and an Anthropic API key (from console.anthropic.com).

```bash
cd law-ai
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
# open http://localhost:3000
```

On Windows PowerShell:

```powershell
$env:ANTHROPIC_API_KEY="sk-ant-..."; npm start
```

## Files

| File | Purpose |
|---|---|
| `server.js` | Express server. Streams Claude responses to the browser over Server-Sent Events; handles web search, refusal fallback and errors. |
| `prompts.js` | Jurisdiction and mode definitions plus the system prompt. Edit this file to tune legal behaviour. |
| `public/index.html` | Chat UI with voice input/output, PDF attach and settings. |

## Deploying

The app is a standard Node app, so it runs on Render, Railway, a VPS and similar hosts. Set `ANTHROPIC_API_KEY` (and optionally `PORT`) as environment variables.
**Before going public, add login and rate limiting**, because every message costs API credits.
