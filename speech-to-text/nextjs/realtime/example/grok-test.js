(async () => {
  try {
    const apiKey = process.env.XAI_API_KEY || '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';
    const model = 'grok-2-latest';
    const transcript = `Alice: Let's finish the Q3 report by June 30. Bob will handle the charts. Decision: postpone marketing until July.
    Action: Bob to send charts by June 25. Meeting ended.`;

    const systemPrompt = `You are a precise summarization assistant for meeting and conversation transcripts. Return ONLY valid JSON with keys: conversationSummary, keyPoints, actionItems, dates, people, finalOutcome. Use "Not mentioned" when info is missing.`;
    const userPrompt = `Transcript:\n\n${transcript}\n\nRespond with only the JSON object described above.`;

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.15, max_tokens: 600 })
    });

    const data = await res.json();
    console.log('raw response:', JSON.stringify(data, null, 2));
    const text = data?.choices?.[0]?.message?.content;
    console.log('message content:', text);
  } catch (err) {
    console.error('grok test error', err);
  }
})();
