type SummaryStyle = "concise" | "bullets" | "detailed";

const JSON_HEADERS = { "Content-Type": "application/json" };

function normalizeStyle(raw: unknown): SummaryStyle {
  if (raw === "bullets" || raw === "detailed" || raw === "concise") return raw;
  return "concise";
}

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?\n]+[.!?\n]*/g) || [])
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function rankImportantSentences(text: string, maxItems: number): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const stopwords = new Set([
    "the","and","is","in","to","of","a","for","that","on","with","as","are","was","it","by","an","be","this","from","or","at","have","has","but","not","you","we","they","i","he","she","them"
  ]);

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));

  const freq: Record<string, number> = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;

  const scored = sentences.map((sentence, idx) => {
    const words = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w));

    const score = words.reduce((acc, w) => acc + (freq[w] || 0), 0) / Math.max(words.length, 1);
    return { sentence, idx, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.sentence);
}

function buildLocalSummary(text: string): string {
  const picked = rankImportantSentences(text, 3);
  if (picked.length === 0) {
    const fallback = text.trim().slice(0, 300);
    return fallback + (text.trim().length > 300 ? "…" : "");
  }

  const first = picked[0];
  const rest = picked.slice(1).join(" ");

  const topicKeywords = [/customer|client|user/i, /support|service|help/i, /outage|down|disconnect|connection/i, /account|billing|subscription/i, /technician|engineer/i];
  let opening = first;
  for (const kw of topicKeywords) {
    const match = picked.find((s) => kw.test(s));
    if (match) {
      opening = match;
      break;
    }
  }

  const paragraph = [opening, rest].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const cleaned = paragraph
    .replace(/\b(um|uh|you know|like|I mean)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();

  const result = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const summary = result.endsWith('.') ? result : result + '.';

  const normalizedSource = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedSummary = summary.toLowerCase().replace(/\s+/g, ' ').trim();
  const tooSimilar =
    normalizedSummary === normalizedSource ||
    normalizedSource.includes(normalizedSummary) ||
    normalizedSummary.length >= normalizedSource.length * 0.8;

  if (tooSimilar) {
    const sentences = splitSentences(text);
    const trimmed = sentences.slice(0, 2).join(' ').trim();
    if (trimmed && trimmed.toLowerCase().replace(/\s+/g, ' ') !== normalizedSource) {
      return trimmed.length > 220 ? `${trimmed.slice(0, 220).trim()}…` : trimmed;
    }

    const words = text.trim().split(/\s+/).filter(Boolean);
    const shorter = words.slice(0, Math.min(40, words.length)).join(' ');
    return shorter.length < text.trim().length ? `${shorter}…` : shorter;
  }

  return summary;
}

function resolveOpenAIEndpoint(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function buildPrompt(style: SummaryStyle, text: string): { system: string; user: string; style: SummaryStyle } {
  // Use the user's provided system-level summarization instructions as the system prompt,
  // and pass the transcript as the user message. The system prompt enforces a single
  // paragraph, professional tone, and other constraints.
  const systemPrompt = `text
You are an intelligent conversation analysis assistant.
Your task is to analyze a complete customer-agent conversation after speech-to-text transcription is finished.
The conversation is related to insurance, policy sales, customer support, or financial consultation calls.
Your goal is to carefully understand the entire conversation and extract meaningful business insights in natural language.

Instructions:

1. Read the complete conversation carefully.
2. Understand both customer and agent intent.
3. Detect important customer information mentioned anywhere in the conversation.
4. Identify customer needs, concerns, preferences, and financial expectations.
5. Create a clean, professional, human-readable analysis.
6. Do NOT return JSON.
7. Do NOT use code blocks.
8. Keep the output structured with proper headings and bullet points.
9. If information is missing, mention "Not clearly mentioned."
10. Do not hallucinate or invent details.

The response should include:

-----------------------------------
Customer Details
-----------------------------------
Extract and explain:
- Customer name
- Age
- Gender (if mentioned)
- Marital status
- Family members/dependents
- Occupation
- Income or salary details
- City/location
- Existing insurance policies
- Health conditions mentioned
- Lifestyle information
- Financial responsibilities

-----------------------------------
Policy Requirements
-----------------------------------
Explain clearly:
- What type of policy the customer is looking for
- Health insurance / life insurance / investment / vehicle insurance etc.
- Coverage expectations
- Preferred benefits
- Claim expectations
- Waiting period concerns
- Hospital/network requirements
- Add-on preferences
- Premium affordability
- Budget expectations
- Monthly or yearly payment preference
- Tax-saving intentions
- Long-term goals

-----------------------------------
Customer Concerns
-----------------------------------
Identify:
- Doubts
- Objections
- Confusions
- Price concerns
- Trust issues
- Previous bad experiences
- Claim-related worries
- Hidden charges concerns
- Renewal concerns

-----------------------------------
Agent Performance Analysis
-----------------------------------
Analyze:
- Did the agent explain the policy properly?
- Was the communication clear?
- Did the agent answer customer questions?
- Did the agent push sales aggressively?
- Was the tone professional?
- Did the agent build trust?
- Was follow-up discussed?

-----------------------------------
Conversation Summary
-----------------------------------
Provide a detailed but concise summary of the complete conversation.

The summary should:
- Capture the full context
- Explain the customer's situation
- Mention policy interest
- Mention important decisions
- Mention any pending follow-up actions

-----------------------------------
Lead Qualification
-----------------------------------
Estimate:
- High Intent Lead
- Medium Intent Lead
- Low Intent Lead

Then explain WHY.

-----------------------------------
Recommended Next Action
-----------------------------------
Suggest:
- Follow-up call
- Share policy brochure
- Premium comparison
- Documentation collection
- Medical test scheduling
- Renewal reminder
- WhatsApp/email follow-up

-----------------------------------
Important Notes
-----------------------------------
Detect and highlight:
- Emotional tone
- Urgency
- Financial sensitivity
- Family protection concerns
- Medical emergency concerns
- Buying signals
- Hesitation signals

Output Style Rules:
- Use professional business language
- Keep formatting clean and readable
- Use headings and bullet points
- Maintain context awareness throughout the response
- Avoid repetition
- Keep the response detailed and insight-focused
- Ensure the summary feels natural and intelligent rather than robotic
`
;

  // The user content will be the transcript. We still include the style for legacy callers,
  // but the system prompt enforces the single-paragraph output.
  return { system: systemPrompt, user: text, style };
}

async function translateToEnglish(text: string, OPENAI_API_URL: string, OPENAI_API_KEY: string, OPENAI_MODEL: string) {
  const endpoint = resolveOpenAIEndpoint(OPENAI_API_URL);
  const system = `You are a translation assistant. Translate the user's text into clear, natural English. Output only the translated text with no explanations.`;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`translate failed ${resp.status} ${resp.statusText} ${txt}`);
    }

    const data = await resp.json().catch(() => null);
    const out = data?.choices?.[0]?.message?.content || data?.output_text || null;
    if (typeof out === "string" && out.trim()) return out.trim();
    return null;
  } catch (e) {
    return null;
  }
}

function looksLikeEcho(summary: string, source: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const s1 = norm(summary);
  const s2 = norm(source);
  if (!s1 || !s2) return false;

  const prefix = s2.slice(0, 120);
  const firstSentence = splitSentences(source)[0] || "";
  const sentencePrefix = norm(firstSentence).slice(0, 120);
  if (prefix && s1.includes(prefix)) return true;
  if (sentencePrefix && s1.includes(sentencePrefix) && s1.length >= s2.length * 0.7) return true;
  if (s1.length >= s2.length * 0.7) return true;
  return false;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text : "";
    const style = normalizeStyle(body?.style);
    const forceLocal = body?.forceLocal === true || body?.forceLocal === "true";

    if (!text.trim()) {
      return new Response(JSON.stringify({ error: "No transcript provided" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1";
    const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (forceLocal) {
      const localSummary = buildLocalSummary(text);
      if (OPENAI_API_KEY) {
        const translated = await translateToEnglish(localSummary, OPENAI_API_URL, OPENAI_API_KEY, OPENAI_MODEL);
        if (translated) {
          return new Response(JSON.stringify({ summary: translated, note: "forced-local-translated" }), { status: 200, headers: JSON_HEADERS });
        }
      }

      return new Response(JSON.stringify({ summary: localSummary, note: "forced-local" }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    if (OPENAI_API_KEY) {
      const endpoint = resolveOpenAIEndpoint(OPENAI_API_URL);
      const promptObj = buildPrompt(style, text);

      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            ...JSON_HEADERS,
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            temperature: 0.0,
            messages: [
              { role: "system", content: promptObj.system },
              { role: "user", content: promptObj.user },
            ],
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          throw new Error(`OpenAI request failed: ${resp.status} ${resp.statusText} ${errText}`);
        }

        const data = await resp.json().catch(() => null);
        let summary =
          data?.choices?.[0]?.message?.content ||
          data?.output_text ||
          data?.summary ||
          null;

        if (typeof summary !== "string" || !summary.trim()) {
          summary = null;
        }

        if (!summary || looksLikeEcho(summary, text)) {
          const local = buildLocalSummary(text);
          if (OPENAI_API_KEY) {
            const translated = await translateToEnglish(local, OPENAI_API_URL, OPENAI_API_KEY, OPENAI_MODEL);
            if (translated) {
              return new Response(
                JSON.stringify({ summary: translated, note: "openai-echo-or-empty-fallback-translated" }),
                { status: 200, headers: JSON_HEADERS }
              );
            }
          }

          return new Response(
            JSON.stringify({ summary: local, note: "openai-echo-or-empty-fallback" }),
            { status: 200, headers: JSON_HEADERS }
          );
        }

        return new Response(JSON.stringify({ summary: summary.trim(), note: "openai" }), {
          status: 200,
          headers: JSON_HEADERS,
        });
      } catch (e) {
        const local = buildLocalSummary(text);
        if (OPENAI_API_KEY) {
          const translated = await translateToEnglish(local, OPENAI_API_URL, OPENAI_API_KEY, OPENAI_MODEL);
          if (translated) {
            return new Response(
              JSON.stringify({ summary: translated, note: "openai-failed-fallback-translated", error: String(e) }),
              { status: 200, headers: JSON_HEADERS }
            );
          }
        }

        return new Response(
          JSON.stringify({ summary: local, note: "openai-failed-fallback", error: String(e) }),
          { status: 200, headers: JSON_HEADERS }
        );
      }
    }

    // No OpenAI configured: return local summary
    const localSummary = buildLocalSummary(text);
    // If OpenAI key exists (shouldn't reach here since OPENAI_API_KEY falsy), attempt translate for completeness
    if (OPENAI_API_KEY) {
      const translated = await translateToEnglish(localSummary, OPENAI_API_URL, OPENAI_API_KEY, OPENAI_MODEL);
      if (translated) {
        return new Response(JSON.stringify({ summary: translated, note: "local-fallback-translated" }), { status: 200, headers: JSON_HEADERS });
      }
    }

    return new Response(JSON.stringify({ summary: localSummary, note: "local-fallback" }), {
      status: 200,
      headers: JSON_HEADERS,
    });

    
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(err) }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

export const runtime = "edge";
