"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { buildLocalSummary } from "@/lib/summarize";

type SummaryStyle = "concise" | "bullets" | "detailed";

export default function SarvamPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [fullTranscript, setFullTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [style, setStyle] = useState<SummaryStyle>("concise");
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<any>(null);

  const transcriptText = useMemo(() => fullTranscript.trim(), [fullTranscript]);

  const appendSegment = useCallback((segment: string) => {
    const clean = segment.trim();
    if (!clean) return;

    setHistory((prev) => [clean, ...prev]);
    setFullTranscript((prev) => (prev ? `${prev} ${clean}` : clean));
  }, []);

  const startRealtime = useCallback(() => {
    setError(null);

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError("Realtime transcription is not supported in this browser. Use Chrome/Edge, or upload an audio file.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let interim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) {
            appendSegment(transcript);
          } else {
            interim += transcript;
          }
        }

        setPartialTranscript(interim.trim());
      };

      recognition.onerror = (ev: any) => {
        const msg = ev?.error ? String(ev.error) : "unknown_error";
        setError(`Realtime transcription error: ${msg}`);
      };

      recognition.onend = () => {
        setIsRecording(false);
        setPartialTranscript("");
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch (e) {
      setError(`Failed to start realtime transcription: ${String(e)}`);
    }
  }, [appendSegment]);

  const stopRealtime = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // no-op
    }
    setIsRecording(false);
    setPartialTranscript("");
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    setFullTranscript("");
    setPartialTranscript("");
    setSummary(null);
    setError(null);
    setUploadError(null);
  }, []);

  const uploadAndTranscribe = useCallback(async () => {
    setUploadError(null);
    setError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError("Please choose an audio file first.");
      return;
    }

    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);

      const resp = await fetch("/api/sarvam-transcribe-file", {
        method: "POST",
        body: fd,
      });
      const data = await resp.json().catch(() => null);

      if (!resp.ok) {
        setUploadError(data?.error || data?.detail || resp.statusText || "Upload transcription failed");
        return;
      }

      const transcript = String(data?.transcript || "").trim();
      if (!transcript) {
        setUploadError("No transcript returned by Sarvam transcription.");
        return;
      }

      setFullTranscript(transcript);
      setHistory(transcript ? transcript.split(/(?<=[.!?])\s+/).filter(Boolean).reverse() : []);
      setSummary(null);
    } catch (e) {
      setUploadError(`Upload failed: ${String(e)}`);
    } finally {
      setUploading(false);
    }
  }, []);

  const summarize = useCallback(async () => {
    if (!transcriptText) {
      setSummary("No transcript to summarize.");
      return;
    }

    try {
      setIsSummarizing(true);
      setSummary(null);

      const resp = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcriptText, style }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        setSummary(data?.error || data?.detail || "Summary request failed");
        return;
      }

      setSummary(String(data?.summary || "Summary not available"));
    } catch (e) {
      console.error('Summarize request failed, using local fallback', e);
      try {
        const local = buildLocalSummary(transcriptText);
        setSummary(`(local) ${local}`);
      } catch (err) {
        setSummary(`Failed to summarize: ${String(e)}`);
      }
    } finally {
      setIsSummarizing(false);
    }
  }, [style, transcriptText]);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
        <header className="space-y-2">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Sarvam AI Transcription</h1>
          <p className="text-sm text-neutral-500">
            Realtime mic transcription plus audio upload transcription with summary support.
          </p>
        </header>

        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={isRecording ? stopRealtime : startRealtime}
              className={`rounded-md px-4 py-2 text-sm font-medium ${isRecording ? "bg-red-500 text-white" : "bg-neutral-900 text-white"}`}
            >
              {isRecording ? "Stop Realtime" : "Start Realtime"}
            </button>

            <button
              onClick={clearAll}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900"
            >
              Clear
            </button>
          </div>

          {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

          {(isRecording || partialTranscript) && (
            <div>
              <h2 className="text-xs text-neutral-500 uppercase tracking-wide">Live Transcript</h2>
              <div className="mt-2 rounded-md border border-neutral-200 px-4 py-3 text-sm text-neutral-700 min-h-[3rem]">
                {partialTranscript || <span className="text-neutral-400">Listening...</span>}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-xs text-neutral-500 uppercase tracking-wide">Upload Audio</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input ref={fileInputRef} type="file" accept="audio/*" />
              <button
                onClick={uploadAndTranscribe}
                disabled={uploading}
                className="rounded-md px-4 py-2 text-sm font-medium bg-neutral-900 text-white disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload & Transcribe"}
              </button>
            </div>
            {uploadError && <div className="mt-2 text-sm text-red-600">{uploadError}</div>}
          </div>

          <div>
            <h2 className="text-xs text-neutral-500 uppercase tracking-wide">Full Transcription</h2>
            <div className="mt-2 rounded-md border border-neutral-200 px-4 py-3 text-sm text-neutral-700 whitespace-pre-wrap min-h-[8rem] max-h-96 overflow-y-auto">
              {fullTranscript || <span className="text-neutral-400">No transcription yet.</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={summarize}
              disabled={isSummarizing || !transcriptText}
              className="rounded-md px-4 py-2 text-sm font-medium bg-neutral-900 text-white disabled:opacity-50"
            >
              {isSummarizing ? "Summarizing..." : "Summarize Transcription"}
            </button>
          </div>

          {summary && (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
              <h3 className="text-xs text-neutral-500 uppercase tracking-wide">Summary</h3>
              <div className="mt-2 whitespace-pre-wrap">{summary}</div>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <h2 className="text-xs text-neutral-500 uppercase tracking-wide">History</h2>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {history.map((item, i) => (
                  <div key={i} className="rounded-md border border-neutral-200 px-4 py-3 text-sm text-neutral-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
