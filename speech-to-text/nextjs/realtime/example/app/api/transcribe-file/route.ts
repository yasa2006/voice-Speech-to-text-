import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Readable } from "stream";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // parse multipart/form-data
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const name = (file as any).name || "audio";

    // Try ElevenLabs if configured
    const elevenKey =
      process.env.ELEVENLABS_API_KEY ||
      process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY ||
      process.env.ELEVENLABS_KEY ||
      process.env.ELEVENLABS;

    if (elevenKey) {
      try {
        const elevenlabs = new ElevenLabsClient({ apiKey: elevenKey });
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const stream = Readable.from(buffer);

        const result = await elevenlabs.speechToText.convert({
          file: stream,
          modelId: "scribe_v2",
        });

        const transcript = (result as any)?.text || (result as any)?.transcript || null;
        if (transcript) return NextResponse.json({ transcript });
        return NextResponse.json({ transcript: JSON.stringify(result) });
      } catch (e) {
        console.error("Server transcription failed:", e);
        // Surface the error to the client so it's clear why transcription failed
        const detail = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: 'Server transcription failed', detail }, { status: 502 });
      }
    }

    // No provider configured — return an explanatory error (so developer can configure ELEVENLABS_API_KEY)
    // Previously this returned a mock transcript; that made it hard to detect configuration issues.
    return NextResponse.json({ error: 'No speech-to-text provider configured. Set ELEVENLABS_API_KEY.' }, { status: 400 });
  } catch (err) {
    console.error("transcribe-file route error:", err);
    return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
  }
}
