import OpenAI from 'openai';

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface SentimentResult {
  sentiment: SentimentLabel;
  score: number;
}

const MODEL = 'gpt-4o-mini';
const SYSTEM_PROMPT =
  'Classify the sentiment of this citizen query summary as exactly one of: positive, neutral, negative.\n' +
  'Also return a score from -1.0 (very negative) to 1.0 (very positive).\n' +
  'Respond only with JSON: {sentiment, score}';

function parseSentimentResponse(raw: string): SentimentResult {
  let jsonText = raw.trim();
  if (jsonText.startsWith('```')) {
    const match = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/i);
    if (match?.[1]) {
      jsonText = match[1];
    }
  }

  const parsed = JSON.parse(jsonText) as { sentiment?: string; score?: number };
  const sentiment = parsed.sentiment;
  const score = parsed.score;

  if (sentiment !== 'positive' && sentiment !== 'neutral' && sentiment !== 'negative') {
    throw new Error('Invalid sentiment label');
  }
  if (typeof score !== 'number' || Number.isNaN(score)) {
    throw new Error('Invalid sentiment score');
  }

  const clampedScore = Math.max(-1, Math.min(1, score));
  return { sentiment, score: clampedScore };
}

export async function analyzeSentiment(summary: string): Promise<SentimentResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 120,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: summary },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty model response');
  }

  return parseSentimentResponse(content);
}
