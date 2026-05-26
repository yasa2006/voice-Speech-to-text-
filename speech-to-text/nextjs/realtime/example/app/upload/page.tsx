"use client";

import { useState, useRef } from "react";
import { buildLocalSummary } from "@/lib/summarize";

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [style, setStyle] = useState<'concise'|'bullets'|'detailed'>('concise');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const compressTranscript = (text: string) => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';

    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length >= 2) {
      return sentences.slice(0, 2).join(' ').trim();
    }

    const words = cleaned.split(/\s+/).filter(Boolean);
    return words.slice(0, Math.min(40, words.length)).join(' ').trim();
  };

  const looksLikeEcho = (summaryText: string, sourceText: string) => {
    const norm = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    const summaryNorm = norm(summaryText);
    const sourceNorm = norm(sourceText);
    if (!summaryNorm || !sourceNorm) return false;
    return (
      summaryNorm === sourceNorm ||
      sourceNorm.includes(summaryNorm) ||
      summaryNorm.length >= sourceNorm.length * 0.8
    );
  };

  const handleUpload = async () => {
    setError(null);
    setTranscript(null);
    setSummary(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('No file selected');
      return;
    }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', file);

      const endpoints = ['/api/sarvam-transcribe-file', '/api/transcribe-file'];

      for (const endpoint of endpoints) {
        const resp = await fetch(endpoint, { method: 'POST', body: fd });
        const data = await resp.json().catch(() => null);

        if (resp.ok) {
          const t = String(data?.transcript || data?.transcription || data?.text || '').trim();
          if (t) {
            setTranscript(t);
            return;
          }
        }

        if (endpoint === endpoints[endpoints.length - 1]) {
          setError(data?.error || data?.detail || resp.statusText || 'Upload failed');
          return;
        }
      }
    } catch (e) {
      console.error('Upload failed', e);
      setError('Upload failed. See console for details.');
    } finally {
      setUploading(false);
    }
  };

  const handleSummarize = async () => {
    if (!transcript) return;
    setIsSummarizing(true);
    setSummary(null);
    try {
      const resp = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, style }),
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.summary) {
        const serverSummary = String(data.summary);
        if (looksLikeEcho(serverSummary, transcript)) {
          const compact = compressTranscript(transcript);
          setSummary(compact ? `(summary) ${compact}` : serverSummary);
        } else {
          setSummary(serverSummary);
        }
      } else if (data?.summary) {
        const serverSummary = String(data.summary);
        if (looksLikeEcho(serverSummary, transcript)) {
          const compact = compressTranscript(transcript);
          setSummary(compact ? `(summary) ${compact}` : serverSummary);
        } else {
          setSummary(serverSummary);
        }
      } else {
        setSummary(data?.error || 'Summary not available');
      }
    } catch (e) {
      console.error('Summarize failed, falling back to local summary', e);
      try {
        const local = buildLocalSummary(transcript);
        const compact = looksLikeEcho(local, transcript) ? compressTranscript(transcript) : local;
        setSummary(compact ? `(local) ${compact}` : 'Summarize failed');
      } catch (err) {
        setSummary('Summarize failed');
      }
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-medium">Upload Audio & Transcribe</h1>
        <p className="text-sm text-neutral-500 mt-1">Upload an audio file and get a full transcription, with an option to summarize.</p>

        <div className="mt-6">
          <input ref={fileRef} type="file" accept="audio/*" />
          <div className="mt-4">
            <button onClick={handleUpload} disabled={uploading} className="rounded-md px-4 py-2 bg-neutral-900 text-white">
              {uploading ? 'Uploading...' : 'Upload & Transcribe'}
            </button>
          </div>
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </div>

        <div className="mt-8">
          <h2 className="text-sm text-neutral-500">Full Transcription</h2>
          <div className="mt-2 rounded-md border border-neutral-200 px-4 py-3 min-h-[6rem] text-sm text-neutral-700 whitespace-pre-wrap">
            {transcript || <span className="text-neutral-400">No transcription yet.</span>}
          </div>

          <div className="mt-4 flex items-center">
            <button onClick={handleSummarize} disabled={!transcript || isSummarizing} className="rounded-md px-3 py-2 bg-neutral-900 text-white">
              {isSummarizing ? 'Summarizing...' : 'Summarize Transcription'}
            </button>
          </div>

          {summary && (
            <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
              <h3 className="text-xs text-neutral-500 uppercase tracking-wide">Summary</h3>
              <div className="mt-2 whitespace-pre-wrap">{summary}</div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
