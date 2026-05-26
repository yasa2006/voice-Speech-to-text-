"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { buildLocalSummary } from "@/lib/summarize";

export default function Home() {
  const [error, setError] = useState<string | null>(null);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [committedHistory, setCommittedHistory] = useState<string[]>([]);
  const [fullTranscript, setFullTranscript] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [summaryStyle, setSummaryStyle] = useState<'concise' | 'bullets' | 'detailed'>('concise');
  const latestPartialRef = useRef("");
  // summary features removed per user request
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const [hasQuotaError, setHasQuotaError] = useState(false);
  const recentScribeErrorsRef = useRef<Map<string, number>>(new Map());
  // Mock Scribe fallback (for local UI testing without ElevenLabs access)
  const [useMock, setUseMock] = useState(false);
  const [mockActive, setMockActive] = useState(false);
  const mockIntervalRef = useRef<number | null>(null);
  const mockSegmentsRef = useRef<string[]>(["Hello, this is a mocked transcript segment.", "This is another mocked sentence for testing.", "Final mock segment to end the session."]);
  const mockIndexRef = useRef(0);
  
  const startMockProducer = useCallback(() => {
    try {
      setError(null);
      setPartialTranscript("");
      setMockActive(true);
      mockIndexRef.current = 0;
      // commit a segment every 3s
      if (mockIntervalRef.current) {
        clearInterval(mockIntervalRef.current as any);
      }
      mockIntervalRef.current = window.setInterval(() => {
        const idx = mockIndexRef.current || 0;
        const segs = mockSegmentsRef.current;
        if (idx >= segs.length) {
          if (mockIntervalRef.current) {
            clearInterval(mockIntervalRef.current as any);
            mockIntervalRef.current = null;
          }
          setMockActive(false);
          return;
        }
        const segment = segs[idx];
        mockIndexRef.current = idx + 1;
        setCommittedHistory(prev => [segment, ...prev]);
        setFullTranscript(prev => {
          const newFull = prev ? `${prev} ${segment}` : segment;
          return newFull;
        });
      }, 3000) as unknown as number;
    } catch (e) {
      console.error('Mock start failed', e);
      setError('Mock failed to start');
    }
  }, []);

  const stopMockProducer = useCallback(() => {
    try {
      if (mockIntervalRef.current) {
        clearInterval(mockIntervalRef.current as any);
        mockIntervalRef.current = null;
      }
      if (mockActive) setMockActive(false);
    } catch (e) {
      console.warn('Failed to stop mock producer', e);
    }
  }, [mockActive]);
  // File upload / transcription states (removed per request)

  const getScribeErrorText = (err: unknown) => {
    if (typeof err === "string") {
      return err;
    }

    if (err instanceof Error) {
      return err.message || err.name || String(err);
    }

    if (err && typeof err === "object") {
      const details = err as Record<string, unknown>;
      const directMessage = details.message ?? details.error ?? details.reason ?? details.detail;

      if (typeof directMessage === "string" && directMessage.trim()) {
        return directMessage;
      }

      if (typeof details.message_type === "string" && details.message_type.trim()) {
        return details.message_type;
      }

      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    }

    return String(err);
  };

  const logScribeError = (label: string, err: unknown) => {
    try {
      // Try to extract a useful message. Favor Error.message, then name, then stringified object.
      let msg = "";
      if (err instanceof Error) {
        msg = err.message || err.name || JSON.stringify({ name: err.name }) || String(err);
      } else if (typeof err === "string") {
        msg = err;
      } else if (err && typeof err === 'object') {
        // Prefer common fields if present
        const e = err as Record<string, any>;
        msg = e.message || e.error || e.reason || e.detail || e.code || JSON.stringify(e);
      } else {
        msg = String(err);
      }

      // normalize
      msg = (msg || "").toString().replace(/^"|"$/g, "").replace(/\s+/g, " ").trim();
      if (!msg || msg === "{}" || msg === "null") msg = "<empty scribe error>";

      const now = Date.now();
      const dedupeKey = `${label}::${msg}`;
      const last = recentScribeErrorsRef.current.get(dedupeKey) || 0;
      // throttle identical messages to once every 10s
      if (now - last > 10000) {
        // Treat empty/generic errors as warnings to reduce console noise
        if (msg === '<empty scribe error>' || msg === 'Error') {
          console.warn(label, msg);
        } else if (/quota|rate|auth|insufficient_funds|quota_exceeded/i.test(label + " " + msg)) {
          console.warn(label, msg);
        } else {
          console.error(label, msg);
        }
        recentScribeErrorsRef.current.set(dedupeKey, now);
      }
    } catch (e) {
      // fallback
      try { console.error(label, err); } catch {};
    }
  };

  // Global error/rejection handler to reduce console spam from orphaned tabs
  useEffect(() => {
    const handler = (ev: ErrorEvent) => {
      try {
        const msg = ev.error instanceof Error ? ev.error.message : ev.message || String(ev.error);
        const normalized = msg.replace(/^"|"$/g, "").replace(/\s+/g, " ").trim();
        // Suppress noisy WebSocket 1006 messages and treat them as controlled warnings
        if (/WebSocket closed unexpectedly|1006|WebSocket closed/i.test(normalized)) {
          logScribeError("WebSocket closed unexpectedly:", normalized);
          const now = Date.now();
          const last = recentScribeErrorsRef.current.get(normalized) || 0;
          if (now - last > 10000) recentScribeErrorsRef.current.set(normalized, now);
          return;
        }
        const now = Date.now();
        const last = recentScribeErrorsRef.current.get(normalized) || 0;
        if (now - last > 10000) {
          console.error("Global error:", ev.error || ev.message);
          recentScribeErrorsRef.current.set(normalized, now);
        }
      } catch (e) {
        // ignore
      }
    };

    const rejHandler = (ev: PromiseRejectionEvent) => {
      try {
        const msg = ev.reason instanceof Error ? ev.reason.message : typeof ev.reason === 'string' ? ev.reason : JSON.stringify(ev.reason);
        const normalized = msg.replace(/^"|"$/g, "").replace(/\s+/g, " ").trim();
        // Suppress noisy WebSocket 1006 messages from promise rejections
        if (/WebSocket closed unexpectedly|1006|WebSocket closed/i.test(normalized)) {
          logScribeError("WebSocket closed unexpectedly:", normalized);
          const now = Date.now();
          const last = recentScribeErrorsRef.current.get(normalized) || 0;
          if (now - last > 10000) recentScribeErrorsRef.current.set(normalized, now);
          return;
        }
        const now = Date.now();
        const last = recentScribeErrorsRef.current.get(normalized) || 0;
        if (now - last > 10000) {
          console.error("Unhandled rejection:", ev.reason);
          recentScribeErrorsRef.current.set(normalized, now);
        }
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener("error", handler as any);
    window.addEventListener("unhandledrejection", rejHandler as any);
    return () => {
      window.removeEventListener("error", handler as any);
      window.removeEventListener("unhandledrejection", rejHandler as any);
    };
  }, []);

  // Suppress a noisy SDK-level console.error for abnormal websocket closure (1006).
  // The app already handles this path via onError and mock fallback, so this keeps dev console clean.
  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      try {
        const joined = args
          .map((v) => (typeof v === "string" ? v : (() => {
            try { return JSON.stringify(v); } catch { return String(v); }
          })()))
          .join(" ");

        if (/WebSocket closed unexpectedly:\s*1006\s*-\s*No reason provided|WebSocket is not connected/i.test(joined)) {
          logScribeError("WebSocket closed unexpectedly:", joined);
          return;
        }
      } catch {
        // ignore filter errors and fall through
      }

      originalConsoleError(...args);
    };

    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  const flushPartialTranscript = useCallback(() => {
    const text = latestPartialRef.current.trim();

    if (!text) {
      return;
    }

    setCommittedHistory(prev => [text, ...prev]);
    setFullTranscript(prev => (prev ? `${prev} ${text}` : text));
    latestPartialRef.current = "";
    setPartialTranscript("");
  }, []);

  

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 1.5,
    vadThreshold: 0.4,
    onPartialTranscript: data => {
      const text = data.text || "";
      latestPartialRef.current = text;
      setPartialTranscript(text);
    },
    onCommittedTranscript: data => {
      if (data.text && data.text.trim()) {
        const segment = data.text;
        setCommittedHistory(prev => [segment, ...prev]);
        // compute new full immediately
        setFullTranscript(prev => {
          const newFull = prev ? `${prev} ${segment}` : segment;
          // auto-scroll transcript container
          setTimeout(() => {
            if (transcriptContainerRef.current) {
              transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
            }
          }, 0);
          return newFull;
        });
      }
      latestPartialRef.current = "";
      setPartialTranscript("");
    },
    onError: err => {
      logScribeError("Scribe error:", err);
      // Surface quota/auth/websocket errors clearly instead of a generic connection failure.
      const msg = getScribeErrorText(err);
      if (/quota|insufficient_funds|insufficient funds/i.test(msg)) {
        setHasQuotaError(true);
        setError(
          "Your ElevenLabs account does not have enough Scribe quota or funds for realtime transcription. Switching to Mock Scribe."
        );
        // auto-fallback to mock mode for continued UX
        if (!useMock) {
          setUseMock(true);
          startMockProducer();
        }
      } else if (/WebSocket is not connected|websocket not connected/i.test(msg)) {
        setError("WebSocket is not connected. Try stopping and starting again.");
      } else if (/1006|closed unexpectedly|WebSocket closed unexpectedly|connection was closed/i.test(msg)) {
        // WebSocket closed unexpectedly (1006) — provide a clearer message and fallback
        setError("WebSocket closed unexpectedly (1006). Switching to Mock Scribe for continued use.");
        if (!useMock) {
          setUseMock(true);
          startMockProducer();
        }
      } else if (/auth|unauthori[sz]ed|forbidden|invalid api key/i.test(msg)) {
        setHasQuotaError(true);
        setError("Authentication error with ElevenLabs Scribe. Switching to Mock Scribe.");
        if (!useMock) {
          setUseMock(true);
          startMockProducer();
        }
      } else {
        setError(msg ? `Connection error occurred: ${msg}` : "Connection error occurred. Please try again.");
      }
      setPartialTranscript("");
    },
    onQuotaExceededError: (err) => {
      logScribeError("Scribe quota exceeded:", err);
      setHasQuotaError(true);
      setError("You have exceeded your ElevenLabs Scribe quota or funds. Switching to Mock Scribe.");
      setPartialTranscript("");
      if (!useMock) {
        setUseMock(true);
        startMockProducer();
      }
    },
    onAuthError: (err) => {
      logScribeError("Scribe auth error:", err);
      setHasQuotaError(true);
      setError("Authentication error with ElevenLabs Scribe. Switching to Mock Scribe.");
      setPartialTranscript("");
      if (!useMock) {
        setUseMock(true);
        startMockProducer();
      }
    },
    onRateLimitedError: (err) => {
      logScribeError("Scribe rate limited:", err);
      setError("Scribe is rate-limiting requests. Please slow down or try again later.");
      setPartialTranscript("");
    },
    onDisconnect: () => {
      flushPartialTranscript();
      setPartialTranscript("");
    },
  });

  // Check both connected and transcribing states to properly show active status
  const isActive =
    scribe.status === "connected" || scribe.status === "transcribing" || mockActive;
  const isConnecting = scribe.status === "connecting";

  const handleStart = useCallback(async () => {
    // don't attempt to start if we already know about a quota/auth issue
    if (hasQuotaError) return;

    // If using mock mode, start the mock producer instead of real Scribe
    if (useMock) {
      startMockProducer();
      return;
    }

    // if already connected/connecting/transcribing, don't start again
    if (scribe.status === "connected" || scribe.status === "connecting" || scribe.status === "transcribing") {
      return;
    }

    try {
      setError(null);
      setPartialTranscript("");

      // Try to acquire microphone permission first so we can show a clear error
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          // release immediately — Scribe will open its own stream
          stream.getTracks().forEach((t) => t.stop());
        } catch (permErr: unknown) {
          console.error("Microphone permission error:", permErr);
          const permName = permErr instanceof Error ? permErr.name : undefined;
          if (permName === "NotAllowedError" || permName === "SecurityError") {
            setError("Microphone access denied. Allow the microphone in your browser and retry.");
            return;
          }
          setError("Unable to access microphone. Please check your device and permissions.");
          return;
        }
      }

      // Fetch a fresh single-use token from our API
      const response = await fetch("/api/scribe-token", { cache: "no-store" });
      // parse JSON if possible (catch parse errors)
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const serverMessage = payload?.error || payload?.message || response.statusText || "Unknown error";
        setError(`Failed to get transcription token: ${serverMessage}`);
        return;
      }

      const token = payload?.token;
      if (!token || typeof token !== "string") {
        setError(`Invalid token from server: ${JSON.stringify(payload)}`);
        return;
      }

      // Connect with microphone access
      await scribe.connect({ token, microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      console.error("Failed to start transcription:", err);
      // show a clearer message for permission-related errors
      const name = err instanceof Error ? err.name : undefined;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Microphone access denied. Allow the microphone in your browser and retry.");
      } else {
        setError("Failed to start transcription. Please check your permissions and try again.");
      }
    }
  }, [scribe, hasQuotaError, useMock, startMockProducer]);

  const handleStop = useCallback(() => {
    flushPartialTranscript();
    try {
      // stop mock if active
      stopMockProducer();

      if (!mockActive && (scribe.status === "connected" || scribe.status === "transcribing" || scribe.status === "connecting")) {
        scribe.disconnect();
      }
    } catch (e) {
      console.warn("Error during disconnect", e);
    }
    setPartialTranscript("");

    // After stopping, generate a summary for the full transcript if available (respect autoSummarize)
    setTimeout(async () => {
      try {
        const text = fullTranscript;
        if (!text || !text.trim()) return;
        if (!autoSummarize) return;
        setIsSummarizing(true);
        setSummary(null);
        const resp = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, style: summaryStyle }),
        });
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.summary) {
          setSummary(String(data.summary));
        } else if (data?.summary) {
          setSummary(String(data.summary));
        } else if (data?.raw && typeof data.raw === 'string') {
          setSummary(data.raw.substring(0, 1000));
        } else {
          setSummary(data?.error || 'Summary not available');
        }
      } catch (e) {
        console.error('Failed to summarize transcript, falling back to local summary', e);
        try {
          const local = buildLocalSummary(fullTranscript);
          setSummary(`(local) ${local}`);
        } catch (err) {
          setSummary('Failed to summarize transcript');
        }
      } finally {
        setIsSummarizing(false);
      }
    }, 50);
  }, [flushPartialTranscript, scribe, mockActive, stopMockProducer, fullTranscript, autoSummarize, summaryStyle]);

  const handleToggle = () => {
    if (isActive) {
      handleStop();
    } else {
      handleStart();
    }
  };

  const handleClearHistory = () => {
    setCommittedHistory([]);
    setFullTranscript("");
    latestPartialRef.current = "";
    // summary-related state removed
    setHasQuotaError(false);
    setError(null);
    // clear any summary-related state (feature removed)
  };
  // summarizeText removed per user request
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
        <header className="space-y-2">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
            Realtime Transcription
          </h1>
          <p className="text-sm text-neutral-500">
            Live speech-to-text with ElevenLabs Scribe.
          </p>
          <div className="pt-2 flex flex-wrap gap-2">
            <a
              href="/upload"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:text-neutral-900"
            >
              Upload Page
            </a>
            <a
              href="/sarvam"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:text-neutral-900"
            >
              Sarvam Option
            </a>
          </div>
        </header>

        <div className="mt-8 space-y-6">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleToggle}
                disabled={isConnecting}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : isConnecting
                      ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                      : "bg-neutral-900 text-white hover:bg-neutral-800"
                }`}
              >
                {isConnecting ? "Connecting..." : isActive ? "Stop" : "Start"}
              </button>
              {error && (
                <button
                  onClick={() => {
                    // try graceful disconnect then reload to clear stale websockets
                    try {
                      if (scribe.status === "connected" || scribe.status === "transcribing" || scribe.status === "connecting") {
                        scribe.disconnect();
                      }
                    } catch (_) {}
                    setHasQuotaError(false);
                    setError(null);
                    // reload page to clear any orphaned connections
                    setTimeout(() => window.location.reload(), 200);
                  }}
                  className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Reset Connection
                </button>
              )}
              {/* Upload audio removed per user request */}
              {committedHistory.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Clear History
                </button>
              )}
              {/* Manual generate summary button */}
              <button
                onClick={async () => {
                  try {
                    if (!fullTranscript || !fullTranscript.trim()) return;
                    setIsSummarizing(true);
                    setSummary(null);
                    const resp = await fetch('/api/summarize', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: fullTranscript, style: summaryStyle }),
                    });
                    const data = await resp.json().catch(() => null);
                    if (resp.ok && data?.summary) setSummary(String(data.summary));
                    else if (data?.summary) setSummary(String(data.summary));
                    else setSummary(data?.error || 'Summary not available');
                  } catch (e) {
                      console.error('Manual summarize failed, falling back to local summary', e);
                      try {
                        const local = buildLocalSummary(fullTranscript);
                        setSummary(`(local) ${local}`);
                      } catch (err) {
                        setSummary('Manual summarize failed');
                      }
                  } finally {
                    setIsSummarizing(false);
                  }
                }}
                className="ml-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Generate Summary
              </button>
              {/* Summarize feature removed */}
            </div>
            <div className="text-xs text-neutral-400">
              {isActive ? (
                <span className="flex items-center">
                  <span className="mr-1.5 h-2 w-2 rounded-full bg-green-500"></span>
                  {scribe.status === "transcribing"
                    ? "Transcribing"
                    : "Connected"}
                </span>
              ) : (
                <span>Disconnected</span>
              )}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Live waveform */}
          <div className="h-16">
            <LiveWaveform
              active={isActive}
              processing={isActive}
              barColor="rgb(115 115 115)"
              fadeEdges={true}
              fadeWidth={24}
              height={64}
            />
          </div>

          {/* Partial transcript */}
          {(isActive || partialTranscript) && (
            <div className="space-y-2">
              <h2 className="text-xs text-neutral-400 uppercase tracking-wide">
                Live Transcript
              </h2>
              <div className="min-h-[3rem] rounded-md border border-neutral-200 px-4 py-3">
                <p className="text-sm text-neutral-600">
                  {partialTranscript || (
                    <span className="text-neutral-400">Listening...</span>
                  )}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            <div>
              {/* Committed transcript history (left) */}
              <div className="space-y-2">
                <h2 className="text-xs text-neutral-400 uppercase tracking-wide">Full Transcript</h2>
                <div ref={el => { transcriptContainerRef.current = el }} className="rounded-md border border-neutral-200 px-4 py-3 text-sm text-neutral-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
                  {fullTranscript}
                </div>
              </div>

              {committedHistory.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h2 className="text-xs text-neutral-400 uppercase tracking-wide">History</h2>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {committedHistory.map((text, index) => (
                      <div key={index} className="rounded-md border border-neutral-200 px-4 py-3 text-sm">
                        {text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Summary box */}
              {summary && (
                <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
                  <h3 className="text-xs text-neutral-500 uppercase tracking-wide">Summary</h3>
                  <div className="mt-2 whitespace-pre-wrap">{summary}</div>
                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(summary);
                        } catch (e) {
                          console.error('Copy failed', e);
                        }
                      }}
                      className="rounded-md px-3 py-1 text-xs bg-neutral-200 hover:bg-neutral-300"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        try {
                          const blob = new Blob([summary], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'summary.txt';
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                        } catch (e) {
                          console.error('Download failed', e);
                        }
                      }}
                      className="rounded-md px-3 py-1 text-xs bg-neutral-200 hover:bg-neutral-300"
                    >
                      Download
                    </button>
                  </div>
                </div>
              )}
              {isSummarizing && (
                <div className="mt-4 text-sm text-neutral-500">Generating summary…</div>
              )}
            </div>

            {/* Summary feature removed */}
          </div>

          

          {/* Instructions when not started */}
          {!isActive && !isConnecting && committedHistory.length === 0 && (
            <div className="text-center py-12 text-sm text-neutral-500">
              Click &quot;Start&quot; to begin transcribing audio from your microphone.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
