import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Support multiple common env var names to make local setups forgiving
  const apiKey =
    process.env.ELEVENLABS_API_KEY ||
    process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY ||
    process.env.ELEVENLABS_KEY ||
    process.env.ELEVENLABS;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ElevenLabs API key not configured. To fix: create a .env.local in the project root with `ELEVENLABS_API_KEY=sk_...` and restart the dev server. For local UI testing without a key, enable 'Use Mock Scribe' in the app.",
      },
      { status: 500 }
    );
  }

  try {
    const elevenlabs = new ElevenLabsClient({
      apiKey: apiKey,
    });

    // Generate a single-use token for realtime transcription
    // create() already returns { token: "..." } so we pass it through directly
    const result = await elevenlabs.tokens.singleUse.create("realtime_scribe");
    return NextResponse.json(result);
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
