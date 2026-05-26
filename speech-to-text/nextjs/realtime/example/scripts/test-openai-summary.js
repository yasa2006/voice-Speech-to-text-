const fs = require('fs');
const path = require('path');

function loadEnv(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

async function main() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const env = loadEnv(envPath);
  const apiKey = env.OPENAI_API_KEY;
  const baseUrl = env.OPENAI_API_URL || 'https://api.openai.com/v1';
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    console.error('OPENAI_API_KEY missing in .env.local');
    process.exit(1);
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const transcript = `Sugar, BP, ఆనే control lo undi. Syllabus late ayyindi, exams and college events delay ayyayi, students missed celebrations, and timelines are uncertain though extension may be possible. Also transport/payment and personal concerns were discussed.`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Summarize the transcript in one clear English paragraph, covering all key points without repetition.'
        },
        {
          role: 'user',
          content: transcript
        }
      ]
    })
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error('OpenAI call failed:', resp.status, text);
    process.exit(1);
  }

  const data = JSON.parse(text);
  const summary = data?.choices?.[0]?.message?.content?.trim();
  console.log('MODEL:', model);
  console.log('SUMMARY:', summary || '(empty)');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
