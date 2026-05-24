# ElevenLabs Speech-to-Text — Quickstart Python Example

Transcribe audio to text using ElevenLabs Scribe v2 and show the transcript plus a Grok summary in a desktop UI.

## Setup

1. Copy the example env file and add your API key:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and add your [ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys).
   If you want transcript summaries, also add your Grok key as `XAI_API_KEY`.

2. Create a virtual environment and install dependencies:

   ```bash
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```

## Run

Launch the desktop UI:

```bash
.venv/bin/python main.py
```

Choose an audio file in the window, then click **Transcribe + Summarize**.

If `XAI_API_KEY` is set, the summary appears in the UI as formatted JSON.

You can still pass a default file path when launching, but the app will show the file picker and let you change it:

```bash
.venv/bin/python main.py ./audio.mp3
```
