import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const sarvamKey = process.env.SARVAM_API_KEY;
    const sarvamUrl = process.env.SARVAM_STT_URL;

    if (!sarvamKey || !sarvamUrl) {
      return NextResponse.json(
        { error: "Sarvam is not configured. Set SARVAM_API_KEY and SARVAM_STT_URL." },
        { status: 400 }
      );
    }

    const fd = new FormData();
    fd.append("file", file, file.name || "audio.wav");

    // Pass through optional fields if provided by client in the future.
    const model = form.get("model");
    const language = form.get("language");
    if (typeof model === "string" && model.trim()) fd.append("model", model);
    if (typeof language === "string" && language.trim()) fd.append("language", language);

    const resp = await fetch(sarvamUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sarvamKey}`,
      },
      body: fd,
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      return NextResponse.json(
        {
          error: "Sarvam transcription failed",
          detail: data?.error || data?.message || resp.statusText,
          raw: data,
        },
        { status: resp.status }
      );
    }

    // Assemble transcript from multiple possible Sarvam response shapes.
    let transcript: string | null = null;

    if (typeof data?.transcript === "string") {
      transcript = data.transcript;
    } else if (Array.isArray(data?.transcript)) {
      transcript = data.transcript.filter(Boolean).join(" ");
    } else if (typeof data?.text === "string") {
      transcript = data.text;
    } else if (Array.isArray(data?.results)) {
      transcript = data.results
        .map((r: any) => (typeof r?.transcript === "string" ? r.transcript : typeof r?.text === "string" ? r.text : ""))
        .filter(Boolean)
        .join(" ");
    } else if (Array.isArray(data?.segments)) {
      transcript = data.segments
        .map((s: any) => (typeof s?.text === "string" ? s.text : typeof s?.transcript === "string" ? s.transcript : ""))
        .filter(Boolean)
        .join(" ");
    } else if (data?.result) {
      if (typeof data.result === "string") transcript = data.result;
      else if (typeof data.result?.transcript === "string") transcript = data.result.transcript;
      else if (Array.isArray(data.result)) {
        transcript = data.result
          .map((r: any) => (typeof r?.transcript === "string" ? r.transcript : typeof r?.text === "string" ? r.text : ""))
          .filter(Boolean)
          .join(" ");
      }
    } else if (typeof data === "string") {
      transcript = data;
    }

    if (!transcript) {
      return NextResponse.json(
        {
          error: "Sarvam response did not contain transcript text",
          raw: data,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ transcript });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to process Sarvam upload", detail: String(err) },
      { status: 500 }
    );
  }
}
