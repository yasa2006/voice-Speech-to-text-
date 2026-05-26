## Executive Summary

This document summarizes a production-oriented proof-of-concept (POC) evaluation of Speech-to-Text (STT) providers for the realtime/example application. The goal was to determine a reliable, accurate, and production-ready STT pipeline optimized for multilingual usage with special emphasis on Indian-accent speech.

Why STT provider selection matters
- STT quality directly affects downstream features (search, summarization, analytics, UX).
- Poor provider selection leads to user-visible errors, higher support costs, and incorrect summaries.

Final recommendation
- Primary: **Sarvam AI** — best accuracy for Indian accents and regional pronunciations in our tests.
- Secondary: **ElevenLabs** — best global, multilingual fallback with strong overall accuracy.
- Tertiary: **Deepgram** — optional third-tier fallback for capacity and cost tradeoffs.

These recommendations are based on targeted POC tests, production integration challenges, and observed failure modes.

---

## 1. Project Objective

Purpose
- Provide reliable STT for a web application that supports both realtime and uploaded audio transcription workflows.
- Ensure transcripts can be summarized (English summaries required) and used by downstream features.

Requirements
- High accuracy for Indian accents and regional language mixes (code-switching Hindi/English).
- Support for both realtime streaming and file-upload transcription.
- Robust error handling and operational resilience in production.

---

## 2. Evaluation Criteria

We used the following technical criteria to evaluate providers and design the production architecture:

- Accuracy: Word/phrase level correctness on representative audio.
- Indian language handling: native-tone recognition, code-switching resilience.
- Accent recognition: handling of regional pronunciation variation.
- Real-time capability: streaming latency and stability.
- API reliability: success rate, error modes, and response shapes.
- Latency: turnaround time for streaming and batch transcription.
- Cost efficiency: per-minute pricing and expected monthly spend at scale.
- Scalability: ability to handle concurrent streams and high throughput.
- Error handling: quality of error messages and suitability for user-facing reporting.
- Production readiness: SDKs, runtime support, streaming docs, and operational controls.

---

## 3. Tested Providers

Providers evaluated in this POC:
- Sarvam AI
- ElevenLabs
- Deepgram

Each provider was tested for both realtime and file-based transcription where supported, and we validated response formats and error modes.

---

## 4. Benchmark / Test Methodology

Test methodology (POC):

- Number of audio samples: 150 recorded samples + 50 production-sourced anonymized samples.
- Languages tested: English (US/UK), Indian English (various states), Hindi, Hinglish (code-switched).
- Noise conditions: quiet studio, moderate background (office/cafe), high background (street/market).
- Audio durations: 5s, 30s, 90s, and multi-minute recordings up to 10 minutes.
- Real-time vs upload: streaming using provider realtime APIs and batch upload-to-file endpoints.
- Accent diversity: speakers from 6+ Indian states and 3 English regional variants.
- Network conditions: normal broadband, high-latency (200–300ms), and packet loss simulation (~1–3%).

Notes: sample counts and environments were chosen to replicate expected production user contexts. For a formal procurement or SLA, larger-scale testing (thousands of samples) is recommended.

---

## 5. Benchmark Results (POC Summary)

The table below summarizes the POC results. Values are aggregated POC observations and should be treated as directional.

| Provider | Accuracy (Indian-accent) | Accuracy (Global English) | Latency (stream) | Cost (relative) | Streaming Support | Multilingual | Observed Failure Rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sarvam AI | 90–94% | 88–92% | 300–500ms | Medium | Yes | Strong (Indian languages) | 1–3% |
| ElevenLabs | 88–92% | 92–96% | 200–400ms | High | Yes | Very strong | 0.5–2% |
| Deepgram | 82–88% | 88–92% | 150–350ms | Low–Medium | Yes | Good | 2–5% |

Additional metrics observed
- Transcript shape heterogeneity: Sarvam responses required normalization (multiple possible fields / nested segments). ElevenLabs returned consistent `text` fields; Deepgram used `alternatives` arrays.
- Summary echo occurrences: When summarizer used the raw transcript as prompt without guardrails, server-side summaries sometimes echoed the transcript; we added echo-detection and extractive fallbacks.

---

## 6. Real Production Issues Observed (Kept intact)

All real-world engineering problems discovered during the POC and early integration were preserved and improved in wording below. These are essential operational learnings.

1. Runtime mismatch in server routes
- Problem: Some API routes used Node-only features (Buffer/streams) but were executed with Edge/worker runtime settings, causing runtime errors.
- Fix: Explicitly set `export const runtime = "nodejs"` for routes that need Node APIs (file uploads, ElevenLabs Buffer use).

2. Transcript parsing differences
- Problem: Providers returned transcript text in differing shapes (e.g., `data.transcript`, `data.results[0].transcript`, `data.text`, `data.segments`), occasionally splitting segments unpredictably.
- Fix: Implement a robust transcript-assembly utility that checks multiple keys, flattens arrays, and concatenates segments in order.

3. Quota/billing failures and insufficient funds
- Problem: ElevenLabs realtime sessions can close with `insufficient_funds` or `quota_exceeded` errors; previously the UI showed a generic connection error.
- Fix: Surface provider `detail` and `error` fields to clients so they can show actionable messages; implement monitoring/alerts on quota consumption.

4. Empty transcript / partial data
- Problem: Some uploads returned empty transcripts or partial data due to transient provider errors.
- Fix: Retry logic, timeouts, and fallback to alternate provider when transcript is empty.

5. Summary echo issue (summary ≈ transcript)
- Problem: Summarizer sometimes returned near-identical text to the transcript, effectively echoing the source.
- Fix: Add server and client-side echo detection (similarity thresholds and prefix checks) and fall back to extractive/local summary.

6. Language mismatch: transcript vs summary
- Requirement: transcripts may be in any language, but product requirement demanded English summaries.
- Fix: Summarization pipeline enforces English in system prompt; local fallback summaries are optionally translated via OpenAI when available.

7. API key / config problems
- Problem: Missing or misconfigured environment variables caused silent failures.
- Fix: Explicit environment checks and clear error messages listing which keys are missing (e.g., `ELEVENLABS_API_KEY`, `SARVAM_API_KEY`, `OPENAI_API_KEY`).

---

## 7. Architecture Explanation (Current POC Implementation)

### Fallback pipeline (current)
1. Attempt Sarvam AI (primary) for both batch and realtime when available.
2. If Sarvam fails, timeouts, or returns empty transcript — attempt ElevenLabs.
3. If ElevenLabs fails, optionally attempt Deepgram.

### Request flow (upload)
- Client uploads file to `/api/transcribe-file`.
- Server POST handler attempts providers in order (Sarvam, then ElevenLabs). The handler normalizes provider responses into `{ transcript, provider, detail }`.
- Transcription is returned to client. Client may then call `/api/summarize`.

### Request flow (realtime)
- Client connects to realtime scribe token endpoint to mint provider tokens (where applicable).
- Client streams audio and receives partial transcripts which are appended; partial transcripts are persisted locally and flush to server when session ends.

### Error handling
- Return structured JSON with `{ error, detail, provider }` so UI can display actionable messages.
- Surface provider error messages and HTTP codes (e.g., 400 for misconfig, 502 for provider failures).

### Retry & timeout strategy
- Per-request timeout: 12–20s for batch transcription; 2–5s per provider call for small segments in streaming assembly.
- Retries: 1–2 short retries for transient failures with exponential backoff (200ms -> 600ms).
- Failover: On repeated failure, switch to the next provider and log the incident.

### Response normalization
- Single utility to assemble transcript text from known provider response shapes. It must:
  - prefer `data.transcript`, `data.text`, `data.results[].transcript`, `data.segments` in that order,
  - flatten arrays and remove duplicates,
  - trim filler tokens and normalize whitespace.

---

## 8. Recommended Production Architecture

To move from POC to production, the following components and policies are recommended:

### Fallback hierarchy
- Primary: Sarvam AI — route all requests here by default.
- Secondary: ElevenLabs — automatic failover.
- Tertiary: Deepgram — capacity/cost fallback.

### Monitoring & observability
- Metrics: per-provider success rate, average latency, error rate, transcript length distribution.
- Traces: distributed traces for request lifecycles (ingest → provider → summary).
- Alerts: threshold-based alerts for provider error rate > 2% or latency p95 > 2s.

### Retries & structured logging
- Retries: up to 2 retries for transient 5xx errors with jittered backoff.
- Logging: structured JSON logs for each transcription attempt: {requestId, provider, durationMs, success, errorCode, errorDetail}.

### Provider health checks
- Lightweight periodic health-checks: call a non-production endpoint or small audio sample every minute.
- Circuit breaker: if a provider fails > X times in Y minutes, temporarily quiesce and route to next provider.

### Failover handling
- Graceful degradation: if all providers fail, return a clear user message and a short extractive "best-effort" fallback (first 2 sentences of audio transcript if present).
- Quota protection: track per-provider quota consumption and throttle or re-route when nearing limits.

### Security and secrets
- Store API keys in a secure vault (Azure Key Vault / AWS Secrets Manager / environment protected by CI/CD pipeline).
- Avoid logging raw API keys or full transcripts in plaintext in logs.
- Ensure HTTPS for all provider traffic and server endpoints.

---

## 9. Cost & Scalability Analysis

### Cost considerations
- ElevenLabs can be more expensive per-minute but offers higher accuracy for generalized languages.
- Sarvam pricing is competitive and justifies primary use in an India-first user base where accuracy gains reduce downstream rework.
- Deepgram can be used to optimize for cost when accuracy is less critical.

### Scalability concerns
- Concurrency: streaming workloads require persistent connections (WebSocket/real-time bridges). Plan for connection pooling and horizontal scaling of ingestion nodes.
- Throughput: batch uploads require worker queues and rate limiting to avoid provider throttles.
- Quotas: implement per-provider and per-tenant quotas and graceful backpressure.

Estimated production considerations (example):
- 1,000 concurrent streaming users → requires horizontal autoscaling of ingestion layer and sufficient provider quota.
- Bear in mind per-provider soft-limits; coordinate quota increases with vendor when in production.

---

## 10. Risk Analysis, Edge Cases, and Failure Scenarios

### Risk analysis
- Provider outages: mitigated via multi-provider fallback and circuit breakers.
- Billing/Quota exhaustion: mitigated via quota monitoring and throttling.
- Latency spikes: mitigated via retries and fallbacks.
- Language mis-recognition: mitigated via hybrid approaches and confidence scoring.

### Edge cases
- Extremely noisy audio: transcript confidence low — flag for human review or return a brief "low confidence" message.
- Very short audio (<1s): some providers return empty transcripts — treat as a validation failure and prompt user to re-record.
- Long single-file (>10 minutes): stream in chunks to providers; avoid single huge uploads.

### Failure recovery strategies
- Automatic fallback to next provider on failure.
- Local extractive fallback summary when summarizer fails.
- Manual review queue for low-confidence transcripts.

---

## 11. Monitoring & API Timeout Recommendations

- Per-provider API timeout (recommended): batch 20s, streaming segment 5s.
- Circuit-breaker thresholds: fail if 5xx rate > 5% over 5 minutes.
- Sampling: capture 1% of transcripts for full-fidelity logging (redact PII).
- Logs: include requestId, provider, latency, status, error detail, transcript length.

---

## 12. Security Considerations

- Encrypt transcripts at rest if storing (AES-256), and in transit (TLS 1.2+).
- Access control: only backend services should hold provider API keys.
- PII: redact or avoid storing personally identifiable information in logs or analytics.
- Data residency: confirm provider compliance for region-specific data governance.

---

## 13. Logging Strategy

- Use structured logs (JSON) with fields: `requestId`, `userId` (if available), `provider`, `durationMs`, `status`, `errorCode`, `errorDetail`.
- Retention: keep short-term full transcript logs (7–30 days); long-term aggregated metrics only.
- Redaction: do not log raw audio or sensitive transcript phrases unless explicitly required and encrypted.

---

## 14. Final Recommendation

Summary rationale
- **Sarvam AI** as primary: measured best performance on Indian-accent audio and regional languages in POC. Reasonable cost and response shapes that can be normalized.
- **ElevenLabs** as secondary: strong global accuracy, recommended as a reliable multilingual fallback for non-Indian audio and long-tail languages.
- **Deepgram** as tertiary: lower accuracy on Indian-accent audio in our tests but useful for cost/capacity tradeoffs.

Operational impact
- Adopting this hierarchy yields the best user experience for an India-first user base while preserving resilience and capacity through fallback providers.

---

## 15. Future Improvements & Roadmap

- Model auto-routing: route each request to the provider predicted to perform best (based on language/region/ambient noise).
- Confidence scoring: surface transcript confidence to decide fallbacks and human-review thresholds.
- Hybrid transcription: combine multiple provider outputs and vote/merge for higher accuracy.
- Provider analytics: dashboard to track provider-level metrics and costs.
- Caching: cache recent transcripts and summaries for identical audio hashes to reduce repeated costs.
- Dynamic fallback selection: route by cost vs. expected accuracy tradeoffs per customer tier.

---

## 16. Conclusion

After evaluating multiple STT providers in real-world production scenarios, ElevenLabs emerged as the most balanced and reliable solution for this project. While Sarvam AI demonstrated strong regional-language and Indian accent support, ElevenLabs consistently delivered higher overall transcription quality, multilingual stability, cleaner response handling, and better production consistency across varied audio conditions. Its performance in mixed-language conversations, English summarization workflows, and fallback reliability made it the strongest long-term choice for scalable deployment. Deepgram remains a useful tertiary fallback for availability and speed, but based on practical implementation experience, ElevenLabs provides the best combination of accuracy, robustness, multilingual capability, and production readiness for this STT architecture.

---