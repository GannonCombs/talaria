# Talaria PRD: Cleetus Phase 4 — Custom Voice Pipeline

**Version:** 1.0
**Date:** April 16, 2026
**Scope:** Always-on ambient voice control with custom wake word ("Cleetus"), local speech-to-text (Whisper), local text-to-speech (Kokoro), and optional Raspberry Pi deployment.
**Depends on:** Phase 1 (MCP Tools), Phase 2 (WebSocket UI Sync). Phase 3 (Claude Voice) is recommended for validation but not required.

---

## 1. Overview

This phase builds a dedicated voice pipeline that runs locally, listens for the custom wake word "Cleetus," processes commands, and speaks responses — all without requiring the Claude app or an internet connection for basic queries. It calls the same MCP tool interface from Phase 1 and triggers the same UI updates from Phase 2.

The pipeline runs as a standalone Node.js process, either on your laptop (for desk use) or on a Raspberry Pi (for kitchen/ambient use). It communicates with Talaria's Next.js app over the local network.

---

## 2. Pipeline Architecture

```
┌──────────────────────────────────────────────────────┐
│                 Cleetus Voice Pipeline                │
│                                                       │
│  ┌─────────┐   ┌─────────┐   ┌──────────────────┐   │
│  │Porcupine│──▶│ Whisper  │──▶│  Intent Router   │   │
│  │(wake    │   │ (STT)   │   │                  │   │
│  │ word)   │   │         │   │ Tier 1: Fuzzy    │   │
│  └─────────┘   └─────────┘   │   match (local)  │   │
│       ▲                       │ Tier 2: Claude   │   │
│       │                       │   Haiku (API)    │   │
│   Microphone                  └────────┬─────────┘   │
│                                        │             │
│                                        ▼             │
│                               ┌──────────────────┐   │
│  ┌─────────┐                  │  Tool Invoker    │   │
│  │ Kokoro  │◀─────────────────│  (HTTP to        │   │
│  │ (TTS)   │                  │   Talaria API)   │   │
│  └────┬────┘                  └──────────────────┘   │
│       │                                              │
│    Speaker                                           │
└──────────────────────────────────────────────────────┘
         │
         │ HTTP POST to localhost:3000/api/tools/invoke
         ▼
┌──────────────────────────────────────────────────────┐
│              Talaria (Next.js App)                    │
│  Tool Registry → Execute → WebSocket UI Update       │
└──────────────────────────────────────────────────────┘
```

---

## 3. Components

### 3.1 Wake Word Detection: Porcupine

**Package:** `@picovoice/porcupine-node`

**Configuration:**
- Custom wake word: "Cleetus" — trained via Picovoice Console (console.picovoice.ai)
  - Provide 3-5 audio samples of yourself saying "Cleetus"
  - Platform: select Mac (for laptop) and/or Linux (for Pi)
  - Download the `.ppn` model file
- Second wake word: "Coma" — trained the same way
  - "Coma" triggers a state toggle: if active, go idle and stop processing. If idle, this word is ignored (Porcupine only listens for "Cleetus" when idle)

**Behavior:**
- Runs continuously, consuming ~1-2% CPU
- Processes audio in 512-sample frames at 16kHz
- On "Cleetus" detection: transition to Recording state
- On "Coma" detection (while in any active state): transition to Idle, speak "Going to sleep"

**Free tier:** Porcupine is free for personal/non-commercial use with up to 3 custom wake words. No API calls, fully on-device.

### 3.2 Voice Activity Detection: Silero VAD

**Package:** `@silero/vad` (or `silero-vad-node`)

**Purpose:** After the wake word is detected, VAD determines when the user has finished speaking. It listens for a configurable silence duration (default: 1.5 seconds of silence = end of utterance).

**Behavior:**
- Activated when Porcupine detects "Cleetus"
- Captures audio frames while speech is detected
- After 1.5 seconds of silence, marks the utterance as complete
- Passes the captured audio buffer to Whisper
- Timeout: if no speech detected within 5 seconds of wake word, return to Idle

### 3.3 Speech-to-Text: Whisper

**Package:** `whisper-node` (Node bindings for whisper.cpp)

**Model:** `whisper-base.en` — English-only base model. Good balance of speed and accuracy for short commands. ~150MB on disk.

**Configuration:**
```javascript
const whisper = require('whisper-node');
const result = await whisper.transcribe({
  model: 'base.en',
  audio: audioBuffer,        // PCM 16-bit, 16kHz mono
  language: 'en',
  translate: false,
  wordTimestamps: false      // Not needed for commands
});
```

**Performance:** On an M-series Mac, base.en transcribes a 3-second utterance in ~200-400ms. On a Raspberry Pi 5, expect 1-2 seconds.

**Output:** Plain text string, e.g., "what's my net worth" or "book a table at Uchi for two on Saturday"

### 3.4 Intent Router: Two-Tier Matching

#### Tier 1: Local Fuzzy Matcher

**Package:** `fuse.js`

A pre-built command registry maps natural language patterns to tool calls. No AI, no API, instant execution.

```typescript
interface CommandPattern {
  patterns: string[];           // Fuzzy match candidates
  tool: string;                 // Tool name to invoke
  paramExtractor?: (text: string) => Record<string, any>;
}

const commands: CommandPattern[] = [
  {
    patterns: [
      "what's my net worth",
      "net worth",
      "how much am I worth",
      "total portfolio value",
      "how much do I have"
    ],
    tool: "portfolio_get_net_worth"
  },
  {
    patterns: [
      "open housing",
      "show housing",
      "go to housing",
      "housing tool",
      "show me houses"
    ],
    tool: "dashboard_navigate",
    paramExtractor: () => ({ target: "housing" })
  },
  {
    patterns: [
      "wallet balance",
      "how much usdc",
      "check my wallet",
      "tempo balance"
    ],
    tool: "wallet_get_balance"
  },
  {
    patterns: [
      "mortgage rates",
      "what are rates",
      "housing rates",
      "interest rates"
    ],
    tool: "housing_get_rates"
  },
  {
    patterns: [
      "bitcoin price",
      "what's bitcoin at",
      "btc price",
      "price of bitcoin"
    ],
    tool: "portfolio_get_price",
    paramExtractor: () => ({ ticker: "BTC" })
  },
  // ... more patterns for each tool
];
```

**Fuse.js configuration:**
```javascript
const fuse = new Fuse(allPatterns, {
  threshold: 0.4,              // Fairly forgiving
  includeScore: true,
  keys: ['text']
});
```

If the best match score is below 0.4 (good match), execute the corresponding tool immediately. If above 0.4 (weak match), escalate to Tier 2.

#### Tier 2: Claude Haiku

For commands that don't match any pattern — natural language queries, complex requests, and anything requiring entity extraction.

**API call:**
```typescript
const response = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 256,
  system: `You are the voice controller for Talaria, a financial dashboard.
Parse the user's command and return a JSON object with:
- tool: the tool name to call
- params: the parameters for that tool

Available tools:
${toolRegistry.getToolDescriptions()}

Current context:
- User's accounts: Fidelity, Coinbase, Kraken, Binance, Wells Fargo, Merrill Lynch, EquityZen, Augment.Markets
- Current date: ${new Date().toISOString().split('T')[0]}

Respond with ONLY valid JSON. No explanation.`,
  messages: [{
    role: "user",
    content: transcribedText
  }]
});

const intent = JSON.parse(response.content[0].text);
// intent = { tool: "portfolio_get_holdings", params: { asset_class: "crypto" } }
```

**Cost:** Claude Haiku at ~$0.0003 per call. At 20 commands/day, that's $0.006/day or ~$2/year.

**Latency:** ~500ms-1 second for Haiku response.

### 3.5 Text-to-Speech: Kokoro

**Package:** `kokoro-js` (official npm package) or self-hosted via Docker with OpenAI-compatible API

**Voice selection:** Pick a natural-sounding male voice from Kokoro's library. Recommended: `am_adam` or `am_michael` — clear, crisp, not overly warm. Test several and pick the one that matches the "competent butler" personality.

**Implementation (npm package):**
```javascript
const kokoro = require('kokoro-js');
const audio = await kokoro.synthesize({
  text: "Your net worth is eight hundred forty-seven thousand, two hundred ninety-one dollars.",
  voice: "am_adam",
  speed: 1.1                   // Slightly faster than default for snappy responses
});
// Play audio buffer through speaker
```

**Implementation (Docker, OpenAI-compatible API):**
```javascript
// Start Kokoro Docker container once:
// docker run -d -p 3002:3000 ghcr.io/eduardolat/kokoro-web:latest

const response = await fetch('http://localhost:3002/api/v1/audio/speech', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: "model_q8f16",
    voice: "am_adam",
    input: "Your net worth is eight hundred forty-seven thousand, two hundred ninety-one dollars.",
    speed: 1.1
  })
});
const audioBuffer = await response.arrayBuffer();
// Play audio buffer through speaker
```

**Number formatting for TTS:** The tool result's `message` field should already contain speakable text. However, add a post-processing step that converts:
- "$847,291.44" → "eight hundred forty-seven thousand, two hundred ninety-one dollars and forty-four cents"
- "5.98%" → "five point nine eight percent"
- "BTC" → "bitcoin"
- "+$1,243" → "up twelve forty-three" or "up one thousand two hundred forty-three"

Use a lightweight number-to-words library for this: `number-to-words` npm package.

### 3.6 Audio I/O

**Package:** `node-microphone` or `mic` for input, `speaker` or `play-sound` for output

**Input:** 16-bit PCM, 16kHz mono from the default USB microphone (or system mic on laptop)

**Output:** Play the Kokoro-generated audio through the default speaker

---

## 4. State Machine

```
                    ┌─────────────┐
         ┌────────▶│    IDLE      │◀──────────┐
         │          │ (Porcupine  │            │
         │          │  listening) │            │
         │          └──────┬──────┘            │
         │                 │                   │
         │         "Cleetus" detected          │
         │                 │                   │
         │          ┌──────▼──────┐            │
         │          │  RECORDING  │            │
  "Coma" │          │ (VAD active,│     5s timeout,
    or   │          │  capturing  │     no speech
  timeout│          │  audio)     │            │
         │          └──────┬──────┘────────────┘
         │                 │
         │          Silence detected
         │          (1.5s)
         │                 │
         │          ┌──────▼──────┐
         │          │ PROCESSING  │
         ├──────────│ (Whisper →  │
         │          │  Router →   │
         │          │  Tool call) │
         │          └──────┬──────┘
         │                 │
         │          Tool result ready
         │                 │
         │          ┌──────▼──────┐
         │          │  SPEAKING   │
         │          │ (Kokoro TTS │
         │          │  playing)   │
         │          └──────┬──────┘
         │                 │
         │          Audio playback complete
         │                 │
         │          ┌──────▼──────┐
         └──────────│  LISTENING  │
                    │ (waiting for│
                    │  follow-up, │
                    │  8s timeout)│
                    └─────────────┘
```

Key detail: after responding, Cleetus enters LISTENING (not IDLE). In this state, Porcupine is NOT active — instead, VAD listens directly for speech. This enables rapid follow-up commands without repeating the wake word:

- "Cleetus, what's my net worth?" → "$847,291" → [LISTENING for 8 seconds]
- "What about just crypto?" → "$196,000" → [LISTENING for 8 seconds]
- [silence for 8 seconds] → [IDLE, Porcupine resumes]

If "Coma" is detected at any point during LISTENING or RECORDING, immediately transition to IDLE.

---

## 5. Process Architecture

### 5.1 Laptop Deployment

The voice pipeline runs as a separate Node.js process alongside Talaria:

```bash
# Terminal 1: Talaria (Next.js)
npm run dev

# Terminal 2: Cleetus voice pipeline
node src/voice/pipeline.js
```

Or use a process manager like `concurrently` to start both:
```json
// package.json scripts
{
  "dev": "concurrently \"next dev\" \"node src/voice/pipeline.js\""
}
```

The voice pipeline communicates with Talaria via HTTP (tool invocation) and WebSocket (UI events).

### 5.2 Raspberry Pi Deployment (optional)

The voice pipeline runs on the Pi; Talaria runs on the laptop.

**Pi setup:**
1. Install Node.js 20+ on Raspbian
2. Clone the Talaria repo (or just the `src/voice/` directory)
3. Install dependencies: porcupine-node, whisper-node, kokoro-js, fuse.js
4. Download Whisper base.en model to the Pi
5. Configure Talaria's host address: `TALARIA_HOST=http://192.168.1.xx:3000`
6. Connect USB speakerphone
7. Run: `node src/voice/pipeline.js`

The Pi makes HTTP calls to Talaria on the laptop over the local network. Latency is negligible (<10ms on local WiFi).

**Auto-start on boot:**
```bash
# /etc/systemd/system/cleetus.service
[Unit]
Description=Cleetus Voice Pipeline
After=network.target

[Service]
ExecStart=/usr/bin/node /home/pi/talaria/src/voice/pipeline.js
Restart=always
User=pi
Environment=TALARIA_HOST=http://192.168.1.xx:3000

[Install]
WantedBy=multi-user.target
```

---

## 6. Audio Feedback Cues

Short audio cues for state transitions (not TTS, just sound effects):

- **Wake word detected:** A short, soft "boop" (ascending two-note chime, 200ms). Signals "I heard you, go ahead."
- **Processing started:** Silence (no sound needed — the user just finished speaking, response comes in 1-3 seconds)
- **Error:** A low "bonk" (descending tone, 200ms). Followed by TTS: "Sorry, I didn't understand that."
- **Going to sleep (Coma):** A descending three-note chime (300ms). No TTS needed.

Store these as small WAV files in `src/voice/sounds/`. Play them using `play-sound` npm package.

---

## 7. Configuration File

```javascript
// src/voice/config.js
module.exports = {
  // Talaria connection
  talariaHost: process.env.TALARIA_HOST || 'http://localhost:3000',
  talariaWsPort: process.env.TALARIA_WS_PORT || 3001,

  // Wake word
  porcupineModelPath: './models/cleetus.ppn',
  comaModelPath: './models/coma.ppn',
  porcupineSensitivity: 0.6,      // 0-1, higher = more sensitive but more false positives

  // Speech-to-text
  whisperModel: 'base.en',
  whisperModelPath: './models/whisper-base.en.bin',

  // Text-to-speech
  kokoroVoice: 'am_adam',
  kokoroSpeed: 1.1,
  kokoroEndpoint: null,           // null = use npm package directly; or 'http://localhost:3002' for Docker

  // VAD
  silenceTimeout: 1500,           // ms of silence before utterance is considered complete
  listeningTimeout: 8000,         // ms to wait for follow-up before returning to idle
  noSpeechTimeout: 5000,          // ms to wait for speech after wake word before returning to idle

  // Intent routing
  fuzzyMatchThreshold: 0.4,       // Fuse.js threshold; lower = stricter matching
  haikuFallback: true,            // Whether to use Claude Haiku for unmatched commands
  haikuApiKey: process.env.ANTHROPIC_API_KEY,

  // Audio
  inputDevice: 'default',        // Microphone device name
  outputDevice: 'default',       // Speaker device name
  soundsPath: './src/voice/sounds/'
};
```

---

## 8. File Structure

```
src/
  voice/
    pipeline.js           ← Main entry point, state machine orchestrator
    wake-word.js          ← Porcupine wrapper
    recorder.js           ← VAD + audio capture
    transcriber.js        ← Whisper wrapper
    intent-router.js      ← Tier 1 fuzzy + Tier 2 Haiku
    commands.js            ← Command pattern registry
    speaker.js            ← Kokoro TTS + audio playback
    number-format.js      ← Number-to-speakable-text conversion
    config.js             ← Configuration
    sounds/
      wake.wav            ← Wake word chime
      error.wav           ← Error sound
      sleep.wav           ← Going to sleep chime
  models/
    cleetus.ppn           ← Custom wake word model
    coma.ppn              ← Custom sleep word model
    whisper-base.en.bin   ← Whisper model weights
```

---

## 9. Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `@picovoice/porcupine-node` | Wake word detection | ~5MB |
| `whisper-node` | Speech-to-text | ~150MB (with base.en model) |
| `kokoro-js` | Text-to-speech | ~100MB (with model) |
| `fuse.js` | Fuzzy string matching | ~20KB |
| `mic` or `node-microphone` | Microphone input | ~50KB |
| `play-sound` | Audio playback | ~10KB |
| `number-to-words` | Number formatting for TTS | ~15KB |
| `@anthropic-ai/sdk` | Claude Haiku for Tier 2 (optional) | ~200KB |

Total: ~260MB, dominated by the Whisper and Kokoro model files.

---

## 10. Build Order

1. **Audio I/O** — get microphone capture and speaker playback working. Test by recording 3 seconds and playing it back.
2. **Whisper integration** — feed recorded audio to Whisper, verify transcription accuracy on short commands.
3. **Kokoro integration** — generate speech from text, verify quality and latency. Pick a voice.
4. **Intent router (Tier 1)** — build the fuzzy command registry, test with common commands.
5. **Tool invoker** — HTTP client that calls Talaria's `/api/tools/invoke` endpoint, parses results.
6. **State machine** — wire everything together: wake word → record → transcribe → route → invoke → speak → listen.
7. **Porcupine wake word** — train "Cleetus" and "Coma" models on Picovoice Console, integrate detection.
8. **Intent router (Tier 2)** — add Claude Haiku fallback for unmatched commands.
9. **Audio feedback** — add chime sounds for state transitions.
10. **Pi deployment** (optional) — test the full pipeline on a Raspberry Pi 5.

---

## 11. Performance Targets

| Metric | Laptop | Raspberry Pi 5 |
|--------|--------|----------------|
| Wake word detection latency | <100ms | <200ms |
| Whisper transcription (3s audio) | 200-400ms | 1-2s |
| Tier 1 intent matching | <10ms | <10ms |
| Tier 2 Haiku call | 500ms-1s | 500ms-1s |
| Kokoro TTS generation | 200-500ms | 1-3s |
| Total: wake to first audio of response (Tier 1) | ~1.5s | ~3.5s |
| Total: wake to first audio of response (Tier 2) | ~2.5s | ~4.5s |

---

## 12. Testing

### Automated
- Unit test each component independently (wake word mock, transcription mock, router, TTS mock)
- Integration test: mock microphone input → full pipeline → verify correct tool called and TTS output generated

### Manual (the real test)
- Stand 3 meters from the microphone and say "Cleetus, what's my net worth?" — verify detection, transcription, and response
- Test in a noisy room (TV on, kitchen sounds)
- Test rapid follow-ups without re-saying the wake word
- Test "Coma" while in the middle of speaking a command
- Test commands that require Tier 2 (Haiku): "Show me my best performing stock this year"
- Time the full round-trip and compare against performance targets
